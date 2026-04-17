"""
S3 Utilities — Presigned URL generation for private S3 objects.

AWS credential strategy:
  - LOCAL DEV:  boto3 uses AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from .env
  - PRODUCTION: boto3 automatically uses the ECS Task IAM Role via instance
                metadata (169.254.170.2). No keys needed in the environment.
                The IAM role `hireai-ecs-task` grants s3:GetObject + s3:PutObject.
"""
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from app.core.config import settings


def _get_s3_client():
    """
    Return a boto3 S3 client.

    On ECS (production): IAM Task Role credentials are picked up automatically
    from the container metadata endpoint — no explicit keys required.

    On local dev: falls back to AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
    from the .env file if they are set.
    """
    kwargs = {"region_name": settings.AWS_REGION}

    # Only pass explicit keys when running locally (both env vars present).
    # In production on ECS these will be empty strings and boto3 will
    # correctly use the Task Role instead.
    if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"]     = settings.AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

    return boto3.client("s3", **kwargs)


def generate_presigned_url_if_s3(url: str, expiry_seconds: int = 3600) -> str:
    """
    If `url` is an S3 URL, generate a presigned URL so private objects
    can be downloaded by the browser. Returns the original URL unchanged
    for non-S3 links (e.g. Supabase Storage, external CDNs).

    Args:
        url:            The raw URL (may or may not be S3).
        expiry_seconds: How long (seconds) the presigned URL is valid.
                        Default: 1 hour.

    Returns:
        A presigned S3 URL, or the original URL if it isn't an S3 link.
    """
    if not url or "amazonaws.com" not in url:
        return url

    try:
        s3 = _get_s3_client()

        # Extract the object key from the S3 URL.
        # URL formats:
        #   https://<bucket>.s3.<region>.amazonaws.com/<key>
        #   https://s3.<region>.amazonaws.com/<bucket>/<key>
        key = url.split(".amazonaws.com/")[-1]

        presigned_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_S3_BUCKET, "Key": key},
            ExpiresIn=expiry_seconds,
        )
        return presigned_url

    except NoCredentialsError:
        print(
            "⚠️  S3 presigned URL failed: No AWS credentials found. "
            "On ECS ensure the task role is attached. "
            "Locally set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env."
        )
        return url
    except ClientError as e:
        print(f"⚠️  S3 presigned URL ClientError: {e.response['Error']['Code']} — {e}")
        return url
    except Exception as e:
        print(f"⚠️  S3 presigned URL unexpected error: {type(e).__name__}: {e}")
        return url


def upload_file_to_s3(file_bytes: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """
    Upload raw bytes to S3 and return the object URL.

    The object is stored as private (no public ACL).
    Use generate_presigned_url_if_s3() to serve it to users.

    Args:
        file_bytes:   Raw file content.
        key:          S3 object key, e.g. "resumes/candidate-123.pdf".
        content_type: MIME type, e.g. "application/pdf".

    Returns:
        The S3 object URL (private, non-presigned).
    """
    try:
        s3 = _get_s3_client()
        s3.put_object(
            Bucket=settings.AWS_S3_BUCKET,
            Key=key,
            Body=file_bytes,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )
        region = settings.AWS_REGION
        bucket = settings.AWS_S3_BUCKET
        return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
    except Exception as e:
        print(f"❌ S3 upload failed for key '{key}': {type(e).__name__}: {e}")
        raise
