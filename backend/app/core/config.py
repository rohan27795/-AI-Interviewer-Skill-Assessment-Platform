"""Application configuration using Pydantic BaseSettings."""
from typing import List, Optional
from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from pathlib import Path
from dotenv import load_dotenv

env_path = str(Path(__file__).resolve().parent.parent.parent / ".env")
load_dotenv(dotenv_path=env_path, override=True)

class Settings(BaseSettings):
    # App
    APP_NAME: str = "HireAI"
    APP_ENV: str = "development"
    DEBUG: bool = True
    USE_REDIS: bool = False
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3002",
        "https://hireai.vercel.app",
        "https://hiring.ashishai.in",
        "https://ashishai.in",
    ]
    
    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    
    # JWT
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_REALTIME_MODEL: str = "gpt-4o-realtime-preview"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_TTL: int = 3600  # 1 hour
    
    # AWS
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    AWS_S3_BUCKET: str = "hireai-uploads"
    AWS_SES_FROM_EMAIL: str = "noreply@hireai.com"
    
    # Resend
    RESEND_API_KEY: str = ""
    
    # SMTP (Alternative to SES)
    USE_SMTP: bool = False
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_NAME: str = "HireAI"
    
    # Langfuse
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"
    
    # Interview Settings
    MATCH_THRESHOLD: float = 0.20  # Default to 20%
    INTERVIEW_ROOM_EXPIRY: int = 7200  # 2 hours
    MAX_INTERVIEW_DURATION: int = 5400  # 90 minutes
    # QA: compress realtime rounds — advance a phase after this many seconds in the
    # current phase once the AI has spoken at least once (still respects full turn count).
    # Example: INTERVIEW_FAST_TEST=true + INTERVIEW_FAST_PHASE_SECONDS=15 → ~4×15s ≈ 1 min total.
    INTERVIEW_FAST_TEST: bool = False
    INTERVIEW_FAST_PHASE_SECONDS: int = 15
    
    # Frontend
    FRONTEND_URL: str = "http://localhost:3002"

    class Config:
        import os
        from pathlib import Path
        # Look for .env in the backend directory specifically
        env_file = str(Path(__file__).resolve().parent.parent.parent / ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
