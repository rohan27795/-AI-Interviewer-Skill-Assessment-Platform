"""Pydantic schemas for API request/response validation."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from enum import Enum
from pydantic import BaseModel, EmailStr, Field, field_validator


# ─── Enums ──────────────────────────────────────────────────────────────────

class UserRole(str, Enum):
    CANDIDATE = "candidate"
    RECRUITER = "recruiter"
    ADMIN = "admin"


class ApplicationStatus(str, Enum):
    APPLIED = "applied"
    SCREENING = "screening"
    INVITED = "invited"
    SCHEDULED = "scheduled"
    INTERVIEWING = "interviewing"
    INTERVIEWED = "interviewed"  # post-interview; assessment available
    OFFERED = "offered"
    REJECTED = "rejected"


class InterviewStatus(str, Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class InterviewRound(str, Enum):
    INTRO = "intro"
    TECHNICAL = "technical"
    BEHAVIORAL = "behavioral"
    SALARY = "salary"


class HireVerdict(str, Enum):
    STRONG_HIRE = "strong_hire"
    HIRE = "hire"
    NO_HIRE = "no_hire"
    STRONG_NO_HIRE = "strong_no_hire"


# ─── Auth Schemas ────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.CANDIDATE
    
    # Role Specific
    company_name: Optional[str] = None
    phone: Optional[str] = None

    class Config:
        populate_by_name = True


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class SocialLoginRequest(BaseModel):
    access_token: str
    role: UserRole = UserRole.CANDIDATE


class ProfileResponse(BaseModel):
    full_name: str
    avatar_url: Optional[str] = None
    company_name: Optional[str] = None
    headline: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    resume_url: Optional[str] = None
    experience_years: Optional[float] = 0
    parsed_data: Optional[Dict[str, Any]] = None

    @field_validator("skills", mode="before")
    @classmethod
    def validate_skills(cls, v: Any) -> List[str]:
        if v is None: return []
        return v


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    headline: Optional[str] = None
    skills: Optional[List[str]] = None
    resume_url: Optional[str] = None
    parsed_data: Optional[Dict[str, Any]] = None
    experience_years: Optional[float] = None


class UserResponse(BaseModel):
    id: str
    email: str
    role: UserRole
    profile: Optional[ProfileResponse] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ─── Job Schemas ─────────────────────────────────────────────────────────────

class JobBase(BaseModel):
    title: str
    description: str
    requirements: List[str] = Field(default_factory=list)
    department: Optional[str] = Field(default="Engineering")
    location: Optional[str] = Field(default="Remote")
    job_type: str = Field(default="full_time", alias="type")
    salary_min: Optional[int] = 0
    salary_max: Optional[int] = 0
    experience_min: Optional[int] = 0
    experience_max: Optional[int] = 0
    salary_range: Optional[str] = None
    is_active: bool = True
    
    @field_validator("requirements", mode="before")
    @classmethod
    def validate_requirements(cls, v: Any) -> List[str]:
        if v is None: return []
        if isinstance(v, str):
            if v.startswith("{") and v.endswith("}"):
                return [s.strip('" ') for s in v[1:-1].split(",")]
            return [v]
        return v

class JobCreate(JobBase):
    pass

class JobResponse(JobBase):
    id: str
    recruiter_id: str
    status: Optional[str] = "active"
    created_at: datetime
    
    applications_count: Optional[int] = 0
    shortlisted_count: Optional[int] = 0
    interviewed_count: Optional[int] = 0

    class Config:
        from_attributes = True


class JDGenerationRequest(BaseModel):
    title: str = Field(..., description="Job title to generate description for")
    department: Optional[str] = Field("Engineering", description="Department name")
    job_type: Optional[str] = Field("full_time", description="full_time, part_time, etc.")
    location: Optional[str] = Field("Remote", description="Location of the job")
    user_input: Optional[str] = Field(None, description="Optional keywords or specific lines to include in JD")


class JDGenerationResponse(BaseModel):
    description: str


# ─── Application Schemas ─────────────────────────────────────────────────────

class ApplicationCreate(BaseModel):
    job_id: str
    candidate_name: str = Field(..., min_length=2)
    candidate_email: EmailStr
    candidate_phone: Optional[str] = None
    resume_url: Optional[str] = None  # Set after S3 upload


class ParsedResumeData(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    experience: List[Dict[str, Any]] = Field(default_factory=list)
    education: List[Dict[str, Any]] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
    total_years_experience: float = 0
    summary: Optional[str] = None


class ApplicationResponse(BaseModel):
    id: str
    job_id: str
    candidate_id: str
    resume_url: Optional[str] = None
    parsed_data: Optional[ParsedResumeData] = None
    ai_score: Optional[float] = 0
    status: str  # keep as plain str to allow any status value from DB
    created_at: datetime
    
    # Joined fields from profiles
    candidate_name: Optional[str] = None
    candidate_phone: Optional[str] = None
    
    # Joined relation: applications → jobs
    jobs: Optional[Dict[str, Any]] = None
    
    # Joined relation: applications → users
    users: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True
        extra = "allow"  # pass through any extra joined fields


class ApplyResponse(BaseModel):
    application_id: str
    ai_score: float = 0
    status: ApplicationStatus
    message: str
    interview_invited: bool


# ─── Schedule Schemas ─────────────────────────────────────────────────────────

class TimeSlot(BaseModel):
    slot_id: str
    start_time: datetime
    end_time: datetime
    available: bool


class BookSlotRequest(BaseModel):
    application_id: str
    slot_id: str


class ScheduleResponse(BaseModel):
    interview_id: str
    scheduled_at: datetime
    unique_link: str
    calendar_invite_sent: bool


# ─── Interview Schemas ────────────────────────────────────────────────────────

class InterviewStateUpdate(BaseModel):
    interview_id: str
    current_round: InterviewRound
    transcript_chunk: str
    speaker: str  # "ai" | "candidate"
    timestamp: datetime


class WebSocketMessage(BaseModel):
    type: str  # "audio_chunk" | "transcript" | "round_change" | "end_interview"
    data: Dict[str, Any]


# ─── Assessment Schemas ───────────────────────────────────────────────────────

class RoundScore(BaseModel):
    round: InterviewRound
    score: float = Field(..., ge=0, le=100)
    duration_seconds: int
    highlights: List[str] = Field(default_factory=list)
    areas_of_concern: List[str] = Field(default_factory=list)


class AssessmentCreate(BaseModel):
    interview_id: str
    transcript: str
    round_scores: List[RoundScore]


class AssessmentResponse(BaseModel):
    id: str
    interview_id: str
    
    # Scores (5-dimension scorecard per BRD §2.6)
    technical_score: Optional[float] = 0
    behavioral_score: Optional[float] = 0
    communication_score: Optional[float] = 0
    cultural_fit_score: Optional[float] = 0
    problem_solving_score: Optional[float] = 0
    overall_score: float
    
    # Salary
    expected_salary: Optional[int] = None
    negotiated_salary: Optional[int] = None
    
    # Verdict
    verdict: Optional[HireVerdict] = None
    verdict_reasoning: Optional[str] = ""
    
    # Detailed breakdown — kept as raw dicts so GPT's schema variance doesn't break validation
    key_strengths: Optional[List[str]] = Field(default_factory=list)
    areas_of_improvement: Optional[List[str]] = Field(default_factory=list)
    round_summaries: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    detailed_report: Optional[Dict[str, Any]] = None

    created_at: Optional[datetime] = None

    # Relationships
    interviews: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True
        # Ignore extra fields from DB rows that aren't in this schema
        extra = "ignore"
