# ============================================================
# HireAI — AWS Infrastructure (Terraform)
# Provisions: VPC + NAT, ECS Fargate, ElastiCache, S3, ALB
# Email: Resend SMTP (no SES required)
# Auth:  GitHub OIDC (no stored AWS keys)
# ============================================================

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.30"
    }
  }
  backend "s3" {
    bucket = "hireai-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "ap-south-1"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "HireAI"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# ─── Variables ───────────────────────────────────────────────
variable "aws_region"       { default = "ap-south-1" }
variable "environment"      { default = "prod" }
variable "app_name"         { default = "hireai" }
variable "github_repo_owner"{ default = "euron-sudh" }
variable "github_repo_name" { default = "-AI-Interviewer-Skill-Assessment-Platform" }

# Main domain: ashishai.in
# App subdomain: hiring.ashishai.in  ← this project lives here
variable "frontend_url"     { default = "https://hiring.ashishai.in" }

variable "certificate_arn"  {
  description = "ACM certificate ARN for hiring.ashishai.in (ap-south-1 region). Request via ACM Console then paste the ARN here."
  default     = "arn:aws:acm:ap-south-1:212919533030:certificate/a3bf97b3-5aad-4b46-87af-3d1437864e29"
}

data "aws_availability_zones" "available" {}

# ─── VPC ─────────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "${var.app_name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.app_name}-igw" }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "${var.app_name}-public-${count.index + 1}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = { Name = "${var.app_name}-private-${count.index + 1}" }
}

# ─── NAT Gateway (gives private ECS containers internet access)
# Required for: Resend SMTP, OpenAI API, Supabase, etc.
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.app_name}-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id   # Put NAT in first public subnet
  tags          = { Name = "${var.app_name}-nat" }
  depends_on    = [aws_internet_gateway.main]
}

# ─── Route Tables ─────────────────────────────────────────────
# Public: routes to Internet Gateway
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${var.app_name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private: routes to NAT Gateway (outbound internet for ECS tasks)
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  tags = { Name = "${var.app_name}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ─── Security Groups ─────────────────────────────────────────
resource "aws_security_group" "alb" {
  name        = "${var.app_name}-alb-sg"
  description = "Allow public HTTP/HTTPS to the load balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.app_name}-alb-sg" }
}

resource "aws_security_group" "ecs" {
  name        = "${var.app_name}-ecs-sg"
  description = "Allow ALB to ECS and all outbound (for Resend, OpenAI, etc.)"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Traffic from ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  # Outbound: unrestricted so ECS can reach Resend SMTP (465),
  # OpenAI (443), Supabase (443), etc. via NAT Gateway
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.app_name}-ecs-sg" }
}

resource "aws_security_group" "redis" {
  name        = "${var.app_name}-redis-sg"
  description = "Allow ECS to Redis"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
  tags = { Name = "${var.app_name}-redis-sg" }
}

# ─── ECR — Container Registry ────────────────────────────────
resource "aws_ecr_repository" "backend" {
  name                 = "${var.app_name}-backend"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = { Name = "${var.app_name}-ecr" }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only 5 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

# ─── CloudWatch Log Group ────────────────────────────────────
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.app_name}-backend"
  retention_in_days = 14
}

# ─── ECS Cluster ─────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.app_name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"   # 1 vCPU
  memory                   = "2048"   # 2 GB RAM
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${aws_ecr_repository.backend.repository_url}:latest"
    essential = true
    portMappings = [{ containerPort = 8000, protocol = "tcp" }]

    environment = [
      { name = "APP_ENV",    value = var.environment },
      { name = "APP_NAME",   value = "HireAI" },
      { name = "DEBUG",      value = "false" },
      { name = "USE_REDIS",  value = "true" },
      { name = "AWS_REGION", value = var.aws_region },
      # NOTE: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are NOT set here.
      # The ECS Task IAM Role provides S3 access automatically via instance metadata.
    ]

    # All sensitive values come from SSM Parameter Store (encrypted at rest)
    secrets = [
      { name = "OPENAI_API_KEY",       valueFrom = aws_ssm_parameter.openai_key.arn },
      { name = "SUPABASE_URL",         valueFrom = aws_ssm_parameter.supabase_url.arn },
      { name = "SUPABASE_KEY",         valueFrom = aws_ssm_parameter.supabase_anon_key.arn },
      { name = "SUPABASE_SERVICE_KEY", valueFrom = aws_ssm_parameter.supabase_service_key.arn },
      { name = "SECRET_KEY",           valueFrom = aws_ssm_parameter.jwt_secret.arn },
      { name = "REDIS_URL",            valueFrom = aws_ssm_parameter.redis_url.arn },
      { name = "RESEND_API_KEY",       valueFrom = aws_ssm_parameter.resend_api_key.arn },
      { name = "AWS_S3_BUCKET",        valueFrom = aws_ssm_parameter.s3_bucket.arn },
      { name = "FRONTEND_URL",         valueFrom = aws_ssm_parameter.frontend_url.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
      interval    = 30
      timeout     = 10
      retries     = 3
      startPeriod = 60
    }
  }])
}

resource "aws_ecs_service" "backend" {
  name                               = "${var.app_name}-backend"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.backend.arn
  desired_count                      = 2
  launch_type                        = "FARGATE"
  health_check_grace_period_seconds  = 120

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false   # Private subnet; outbound goes via NAT Gateway
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]
}

# ─── Application Load Balancer ───────────────────────────────
resource "aws_lb" "main" {
  name               = "${var.app_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  access_logs {
    bucket  = aws_s3_bucket.uploads.id
    prefix  = "alb-logs"
    enabled = false   # Enable when needed for troubleshooting
  }
}

resource "aws_lb_target_group" "backend" {
  name        = "${var.app_name}-backend-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 5
    interval            = 30
    timeout             = 10
    matcher             = "200"
  }
}

# HTTP → HTTPS redirect (port 80 always redirects to 443)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS listener (requires ACM certificate — set var.certificate_arn)
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# ─── ElastiCache Redis ───────────────────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.app_name}-redis-subnet"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${var.app_name}-redis"
  description                = "HireAI Redis Cluster"
  node_type                  = "cache.t3.small"
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  engine_version             = "7.0"
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

# ─── S3 — Resume & Recording Storage ─────────────────────────
resource "aws_s3_bucket" "uploads" {
  bucket = "${var.app_name}-uploads-${var.environment}"
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = [var.frontend_url, "http://localhost:3002"]
    max_age_seconds = 3000
  }
}

# ─── SSM Parameters (Secrets) ────────────────────────────────
# All app secrets live here — ECS reads them at startup.
# Set real values via AWS Console or CLI after first `terraform apply`.

resource "aws_ssm_parameter" "openai_key" {
  name  = "/${var.app_name}/${var.environment}/OPENAI_API_KEY"
  type  = "SecureString"
  value = "PLACEHOLDER_SET_VIA_CONSOLE_OR_CLI"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "supabase_url" {
  name  = "/${var.app_name}/${var.environment}/SUPABASE_URL"
  type  = "SecureString"
  value = "PLACEHOLDER_SET_VIA_CONSOLE_OR_CLI"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "supabase_anon_key" {
  name  = "/${var.app_name}/${var.environment}/SUPABASE_KEY"
  type  = "SecureString"
  value = "PLACEHOLDER_SET_VIA_CONSOLE_OR_CLI"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "supabase_service_key" {
  name  = "/${var.app_name}/${var.environment}/SUPABASE_SERVICE_KEY"
  type  = "SecureString"
  value = "PLACEHOLDER_SET_VIA_CONSOLE_OR_CLI"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${var.app_name}/${var.environment}/SECRET_KEY"
  type  = "SecureString"
  value = "PLACEHOLDER_SET_VIA_CONSOLE_OR_CLI"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "redis_url" {
  name  = "/${var.app_name}/${var.environment}/REDIS_URL"
  type  = "SecureString"
  # TLS-enabled Redis: rediss:// with the cluster's primary endpoint
  value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
}

# RESEND — replaces SES. Set your real key after first apply.
resource "aws_ssm_parameter" "resend_api_key" {
  name  = "/${var.app_name}/${var.environment}/RESEND_API_KEY"
  type  = "SecureString"
  value = "PLACEHOLDER_SET_VIA_CONSOLE_OR_CLI"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "s3_bucket" {
  name  = "/${var.app_name}/${var.environment}/AWS_S3_BUCKET"
  type  = "String"
  value = aws_s3_bucket.uploads.id
}

resource "aws_ssm_parameter" "frontend_url" {
  name  = "/${var.app_name}/${var.environment}/FRONTEND_URL"
  type  = "String"
  value = var.frontend_url
}

# ─── IAM — ECS Execution Role ────────────────────────────────
# This role allows ECS to pull images from ECR and read SSM secrets at startup.
resource "aws_iam_role" "ecs_execution" {
  name = "${var.app_name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow ECS execution role to read SSM parameters (for secrets injection)
resource "aws_iam_role_policy" "ecs_execution_ssm" {
  name = "${var.app_name}-ecs-execution-ssm"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
      Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/${var.app_name}/*"
    }]
  })
}

# ─── IAM — ECS Task Role ─────────────────────────────────────
# This role is assumed BY your running FastAPI container.
# It gives the app permission to use S3.
# NOTE: No SES permissions — we use Resend (external SMTP) instead.
resource "aws_iam_role" "ecs_task" {
  name = "${var.app_name}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_policy" {
  name = "${var.app_name}-ecs-task-policy"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # S3: read/write/delete resumes and recordings
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          "${aws_s3_bucket.uploads.arn}",
          "${aws_s3_bucket.uploads.arn}/*"
        ]
      },
      # SSM: read runtime config (applied during container execution)
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/${var.app_name}/*"
      }
      # NOTE: No SES permissions needed — email is sent via Resend SMTP
      # over port 465 through the NAT Gateway (outbound internet access).
    ]
  })
}

# ─── IAM — GitHub Actions OIDC (Keyless CI/CD) ───────────────
# GitHub Actions assumes this role via OpenID Connect.
# NO AWS keys are stored in GitHub Secrets.

data "aws_caller_identity" "current" {}

# GitHub OIDC provider (only needs to be created once per AWS account)
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # GitHub's OIDC thumbprint (stable, from GitHub docs)
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]
}

resource "aws_iam_role" "github_actions" {
  name        = "${var.app_name}-github-actions"
  description = "Role assumed by GitHub Actions via OIDC for HireAI deployments"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # Only the specific repo's development branch can assume this role
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo_owner}/${var.github_repo_name}:ref:refs/heads/development"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_actions_policy" {
  name = "${var.app_name}-github-actions-policy"
  role = aws_iam_role.github_actions.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ECR: login + push images
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage"
        ]
        Resource = "*"
      },
      # ECS: update service + describe tasks
      {
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:ListTaskDefinitions"
        ]
        Resource = "*"
      },
      # IAM: pass roles to ECS (needed for task definition registration)
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [
          aws_iam_role.ecs_execution.arn,
          aws_iam_role.ecs_task.arn
        ]
      },
      # Terraform state: S3 backend
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject", "s3:PutObject", "s3:ListBucket",
          "s3:DeleteObject", "s3:GetBucketVersioning"
        ]
        Resource = [
          "arn:aws:s3:::hireai-terraform-state",
          "arn:aws:s3:::hireai-terraform-state/*"
        ]
      },
      # Terraform: broad read/write for infra provisioning
      # Scope this down in production once infra is stable.
      {
        Effect   = "Allow"
        Action   = [
          "ec2:*", "ecs:*", "ecr:*", "elasticache:*",
          "logs:*", "ssm:*", "iam:Get*", "iam:List*",
          "iam:CreateRole", "iam:DeleteRole", "iam:AttachRolePolicy",
          "iam:DetachRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy",
          "iam:CreateOpenIDConnectProvider", "iam:DeleteOpenIDConnectProvider",
          "iam:GetOpenIDConnectProvider",
          "elasticloadbalancing:*"
        ]
        Resource = "*"
      }
    ]
  })
}

# ─── Outputs ─────────────────────────────────────────────────
output "alb_dns_name" {
  description = "Point your domain CNAME here"
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  description = "ECR URL for Docker push"
  value       = aws_ecr_repository.backend.repository_url
}

output "redis_endpoint" {
  description = "ElastiCache primary endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "s3_bucket_name" {
  description = "S3 bucket for resumes / recordings"
  value       = aws_s3_bucket.uploads.id
}

output "github_actions_role_arn" {
  description = "ARN to paste into GitHub Actions workflow (role-to-assume)"
  value       = aws_iam_role.github_actions.arn
}

output "nat_gateway_public_ip" {
  description = "NAT Gateway Elastic IP (whitelist this in any external service if needed)"
  value       = aws_eip.nat.public_ip
}
