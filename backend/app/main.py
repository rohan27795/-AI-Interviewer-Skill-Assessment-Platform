"""
HireAI — AI Interviewer Platform
FastAPI Application Entry Point
"""
import traceback
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import subprocess
import sys

# --- EMERGENCY STARTUP RESCUE ---
try:
    import email_validator
except ImportError:
    print("⚠️ EMERGENCY: email-validator missing at runtime! Installing now...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "email-validator"])
    import email_validator
    print("✅ SUCCESS: email-validator installed and loaded.")
# -------------------------------

from app.core.config import settings
from app.core.database import init_db
from app.api.v1.endpoints import (
    jobs, applications, schedule, assessment, auth, profiles,
    realtime_proxy, analytics
)

print(f"DEBUG_STARTUP: Loading main.py")
print(f"DEBUG_STARTUP: Match Threshold: {settings.MATCH_THRESHOLD}")
print(f"DEBUG_STARTUP: Frontend URL: {settings.FRONTEND_URL}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown hooks."""
    await init_db()
    print("Database initialized")
    print(f">>> SETTINGS: MATCH_THRESHOLD={settings.MATCH_THRESHOLD}")
    print(f">>> SETTINGS: RESEND_API_KEY={'SET' if settings.RESEND_API_KEY else 'NOT SET'}")
    print("HireAI Backend started on port 8002")
    yield
    print("HireAI Backend shutting down")


app = FastAPI(
    title="HireAI API",
    description="AI-Powered Interview & Skill Assessment Platform",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)


# ── CORS: Must be added FIRST ──
# Production: locked to specific origins via ALLOWED_ORIGINS setting.
# Local dev: set ALLOWED_ORIGINS in .env; it defaults to localhost:3002.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["Content-Length", "X-Process-Time"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)


# ── Global exception handler — ALWAYS returns CORS headers ──
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch ALL unhandled exceptions and return a proper JSON response with CORS headers."""
    tb = traceback.format_exc()
    print(f"UNHANDLED ERROR on {request.method} {request.url}:")
    print(tb)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": tb},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )


# ── Request logging ──
@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f">> {request.method} {request.url}")
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        # This catches errors that happen DURING request processing
        tb = traceback.format_exc()
        print(f"MIDDLEWARE CAUGHT ERROR: {e}")
        print(tb)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e)},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        )


# Routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["Jobs"])
app.include_router(applications.router, prefix="/api/v1/applications", tags=["Applications"])
app.include_router(profiles.router, prefix="/api/v1/profiles", tags=["Candidate Profiles"])
app.include_router(schedule.router, prefix="/api/v1/schedule", tags=["Scheduling"])
app.include_router(assessment.router, prefix="/api/v1/assessments", tags=["Assessments"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
from app.api.v1.endpoints import assistant_chat
app.include_router(assistant_chat.router, prefix="/api/v1/assistant", tags=["AI Assistant"])
app.include_router(realtime_proxy.router, prefix="/ws/v1", tags=["Realtime Speech-to-Speech"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "HireAI API",
        "version": "1.0.0",
    }
