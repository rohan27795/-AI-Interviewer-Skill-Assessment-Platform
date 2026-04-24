"""
Applications API — Resume Upload, AI Parsing, JD Matching, Auto-Invite.
Core screening pipeline.
"""
import uuid
import os
import tempfile
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from typing import Optional

from app.core.database import get_supabase, get_redis
from app.core.config import settings
from app.schemas.schemas import ApplicationResponse, ApplyResponse, ApplicationStatus
from app.services.resume_parser import resume_parser
from app.services.matching_engine import get_matching_engine
from app.services.email_service import send_interview_invite
from app.services.s3_utils import generate_presigned_url_if_s3
from app.api.v1.endpoints.auth import get_current_user
import boto3

router = APIRouter()


async def upload_resume_to_s3(file: UploadFile, application_id: str) -> str:
    """Upload resume file to AWS S3 and return public URL."""
    try:
        s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        
        extension = file.filename.split(".")[-1].lower()
        key = f"resumes/{application_id}/{uuid.uuid4()}.{extension}"
        
        content = await file.read()
        s3.put_object(
            Bucket=settings.AWS_S3_BUCKET,
            Key=key,
            Body=content,
            ContentType=file.content_type,
            ServerSideEncryption="AES256",
        )
        
        return f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
    except Exception as e:
        print(f"DEBUG: S3 Upload failed: {e}")
        return f"/api/v1/applications/dummy-resume/{application_id}/{file.filename}"


async def run_screening_pipeline(
    application_id: str,
    job_id: str,
    resume_text: str,
    candidate_email: str,
    candidate_name: str,
):
    """
    Background task: Parse resume → Match with JD → Update DB → Send invite.
    """
    debug_log = os.path.join(tempfile.gettempdir(), f"screening_debug_{application_id}.log")
    
    def log(msg: str):
        try:
            with open(debug_log, "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now().isoformat()}] {msg}\n")
        except Exception:
            pass  # Fallback to print if file write fails
        print(f"DEBUG_PIPELINE: {msg}")

    log(f"🚀 STARTING SCREENING for {candidate_email}")
    supabase = get_supabase()

    try:
        # Update status to screening
        try:
            supabase.table("applications").update(
                {"status": "screening"}
            ).eq("id", application_id).execute()
        except Exception as e:
            print(f"WARN: Failed to set screening status: {e}")
        
        # 1. Parse resume
        log(f"Step 1: Parsing resume ({len(resume_text)} chars)")
        parsed_data = await resume_parser.parse_resume(resume_text)
        log(f"Step 1 COMPLETE: Parsed data for {candidate_email}")
        
        # 2. Fetch JD from DB (NOT Redis — Redis may be down)
        jd_data = {}
        redis_client = await get_redis()
        jd_cache_key = f"jd:embedding:{job_id}"
        
        # Try Redis cache first (only if Redis is available)
        if redis_client is not None:
            try:
                import json
                cached = await redis_client.get(jd_cache_key)
                if cached:
                    jd_data = json.loads(cached)
            except Exception as e:
                print(f"WARN: Redis cache read failed: {e}")
        
        # If no cached data, fetch from DB
        if not jd_data:
            try:
                # NOTE: Column is "embedding" in DB, not "requirements_embedding"
                job = supabase.table("jobs").select(
                    "title, description, requirements, experience_min"
                ).eq("id", job_id).single().execute()
                if job.data:
                    jd_data = job.data
                else:
                    print(f"WARN: Job {job_id} not found during screening")
            except Exception as e:
                print(f"WARN: Job fetch failed: {e}")
            
            # Cache for next time (only if Redis is available)
            if jd_data and redis_client is not None:
                try:
                    import json
                    await redis_client.setex(jd_cache_key, settings.REDIS_TTL, json.dumps(jd_data))
                except Exception:
                    pass  # Caching failure is non-fatal
        
        # 3. Compute match score
        engine = get_matching_engine()
        req_skills = jd_data.get("requirements") or []
        if not isinstance(req_skills, list):
            req_skills = [str(req_skills)] if req_skills else []

        match_score = await engine.compute_match_score(
            parsed_resume=parsed_data,
            job_id=job_id,
            job_description=jd_data.get("description") or "",
            required_skills=req_skills,
            min_experience=jd_data.get("experience_min") or 0,
        )
        print(f"DEBUG: Match score for {candidate_email}: {match_score} (Threshold: {settings.MATCH_THRESHOLD})")
        
        # 4. Determine status
        new_status = (
            "invited"
            if match_score >= settings.MATCH_THRESHOLD
            else "applied"
        )
        
        # 5. Update application
        update_data = {
            "ai_score": match_score,
            "status": new_status,
        }
        if parsed_data:
            try:
                update_data["parsed_data"] = parsed_data.model_dump()
                update_data["resume_summary"] = parsed_data.summary
            except Exception:
                pass
            
        try:
            log(f"Step 5: Updating database with score {match_score}")
            supabase.table("applications").update(update_data).eq("id", application_id).execute()
            log("Step 5 COMPLETE: Database updated")
        except Exception as e:
            log(f"Step 5 ERROR: {e}")
            print(f"ERROR: Failed to update application: {e}")
        
        # 6. Send interview invite if qualified
        if match_score >= settings.MATCH_THRESHOLD:
            try:
                # Get job title for the email
                job_title = jd_data.get("title") or "this role"
                if not jd_data.get("title"):
                    job_res = supabase.table("jobs").select("title").eq("id", job_id).single().execute()
                    if job_res.data:
                        job_title = job_res.data.get("title", "this role")

                schedule_link = f"{settings.FRONTEND_URL}/candidate/schedule?app_id={application_id}"
                log(f"Step 6: Sending invite to {candidate_email} (Score: {match_score})")
                await send_interview_invite(
                    to_email=candidate_email,
                    candidate_name=candidate_name,
                    match_score=int(match_score * 100),
                    schedule_link=schedule_link,
                    job_title=job_title,
                )
                log(f"Step 6 COMPLETE: Invite sent to {candidate_email}")
            except Exception as e:
                log(f"Step 6 ERROR: {e}")
                print(f"WARN: Failed to send invite email: {e}")
        else:
            log(f"ABORT: Score {match_score} below threshold {settings.MATCH_THRESHOLD}")
            print(f"DEBUG: Score {match_score} below threshold {settings.MATCH_THRESHOLD}")

    except Exception as e:
        log(f"❌ CRITICAL PIPELINE FAILURE: {e}")
        import traceback
        log(traceback.format_exc())
        print(f"ERROR: Screening pipeline failed for {application_id}: {e}")
        traceback.print_exc()
        try:
            supabase.table("applications").update(
                {"status": "applied"}
            ).eq("id", application_id).execute()
        except Exception:
            pass


@router.post("/apply", response_model=ApplyResponse, status_code=201)
async def apply_for_job(
    background_tasks: BackgroundTasks,
    job_id: str = Form(...),
    candidate_name: str = Form(...),
    candidate_email: str = Form(...),
    candidate_phone: Optional[str] = Form(None),
    resume: Optional[UploadFile] = File(None),
    use_saved_profile: str = Form("false"),
):
    """
    Submit job application with resume.
    Triggers identity/profile creation if needed.
    """
    use_saved = (use_saved_profile or "").strip().lower() in ("true", "1", "yes", "on")
    supabase = get_supabase()
    
    # 1. Validate inputs based on mode
    if not use_saved and not resume:
        raise HTTPException(status_code=400, detail="Either a resume file or use_saved_profile must be provided.")
        
    if resume:
        allowed_types = {
            "application/pdf", 
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
            "application/octet-stream"
        }
        if resume.content_type not in allowed_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type: {resume.content_type}. Only PDF and DOCX are accepted."
            )
    
    # 2. Check job exists and is active
    job = supabase.table("jobs").select("id, is_active").eq("id", job_id).execute()
    if not job.data or not job.data[0]["is_active"]:
        raise HTTPException(status_code=400, detail="Job not found or inactive.")
    
    # 3. Create identity/profile if not exists (guest apply)
    user_res = supabase.table("users").select("id").eq("email", candidate_email).execute()
    if user_res.data:
        candidate_id = user_res.data[0]["id"]
    else:
        candidate_id = str(uuid.uuid4())
        try:
            supabase.table("users").insert({
                "id": candidate_id,
                "email": candidate_email,
                "role": "candidate",
            }).execute()
        except Exception as e:
            err = str(e).lower()
            if "duplicate" in err or "23505" in err or "unique" in err:
                retry = supabase.table("users").select("id").eq("email", candidate_email).execute()
                if retry.data:
                    candidate_id = retry.data[0]["id"]
                else:
                    raise HTTPException(status_code=500, detail="Could not create or resolve candidate account.")
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"User registration failed: {e!s}",
                ) from e

    # ALWAYS update/sync profile name and phone from the latest application
    try:
        supabase.table("profiles").upsert({
            "id": candidate_id,
            "full_name": candidate_name,
            "phone": candidate_phone,
        }).execute()
    except Exception as e:
        print(f"WARN: Failed to sync profile for {candidate_id}: {e}")
        
    # Check if using saved profile but profile has no resume
    saved_resume_url = None
    saved_parsed_data = None
    if use_saved:
        prof_res = supabase.table("profiles").select("resume_url, parsed_data").eq("id", candidate_id).single().execute()
        if not prof_res.data or not prof_res.data.get("resume_url"):
            raise HTTPException(status_code=400, detail="Cannot use saved profile: no resume found on your profile.")
        saved_resume_url = prof_res.data.get("resume_url")
        saved_parsed_data = prof_res.data.get("parsed_data")
    
    # 4. Upload resume & create application record
    application_id = str(uuid.uuid4())
    if use_saved:
        resume_url = saved_resume_url
    else:
        resume_url = await upload_resume_to_s3(resume, application_id)
        # upload_resume_to_s3 reads the Spooled file; rewind for text extraction below
        try:
            await resume.seek(0)
        except Exception:
            pass

    try:
        supabase.table("applications").insert({
            "id": application_id,
            "job_id": job_id,
            "candidate_id": candidate_id,
            "resume_url": resume_url,
            "status": "applied",
        }).execute()
    except Exception as e:
        # Check if it's a duplicate key error
        err_str = str(e)
        if "duplicate key value" in err_str or "23505" in err_str:
            raise HTTPException(
                status_code=400, 
                detail="You have already applied for this job! Please check your email for the interview invite."
            )
        print(f"ERROR: Application insert failed: {e}")
        raise HTTPException(status_code=500, detail="Database failure. Please try again.")
    
    # 5. Extract text for screening (skip if using saved profile and already parsed)
    resume_text_str = ""
    if use_saved and saved_parsed_data:
        print(f"DEBUG: Using saved profile data for {candidate_email}, skipping document extraction.")
    elif resume:
        content = await resume.read()
        try:
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=os.path.splitext(resume.filename or ".txt")[1]
            ) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            
            try:
                resume_text_str = await resume_parser.extract_text_from_file(tmp_path)
                print(f"DEBUG: Extracted {len(resume_text_str)} chars from {resume.filename}")
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
        except Exception as e:
            print(f"DEBUG: Text extraction failed: {e}")
            try:
                resume_text_str = content.decode("utf-8")
            except Exception:
                resume_text_str = "[Extraction Failed]"
    
    # Update application with saved parsed data if available BEFORE screening runs
    if use_saved and saved_parsed_data:
        try:
            supabase.table("applications").update({
                "parsed_data": saved_parsed_data
            }).eq("id", application_id).execute()
        except Exception:
            pass
    
    # 6. Screening (must not roll back a successful application insert)
    print(f"DEBUG: Running screening for {candidate_email}")
    try:
        await run_screening_pipeline(
            application_id=application_id,
            job_id=job_id,
            resume_text=resume_text_str,
            candidate_email=candidate_email,
            candidate_name=candidate_name,
        )
    except Exception as e:
        print(f"ERROR: Screening failed after insert (application_id={application_id}): {e}")
        import traceback
        traceback.print_exc()
    
    # Fetch final updated data
    final_row = supabase.table("applications").select("ai_score, status").eq("id", application_id).single().execute()
    final_score = final_row.data.get("ai_score") or 0.0
    final_status = final_row.data.get("status") or ApplicationStatus.APPLIED
    
    is_invited = final_score >= settings.MATCH_THRESHOLD
    
    return ApplyResponse(
        application_id=application_id,
        ai_score=final_score,
        status=final_status,
        message="Application submitted successfully.",
        interview_invited=is_invited,
    )


@router.get("/{application_id}/status", response_model=ApplicationResponse)
async def get_application_status(application_id: str):
    """Poll application status."""
    supabase = get_supabase()
    result = supabase.table("applications").select("*, jobs(title)").eq("id", application_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Application not found.")
    
    app_data = result.data
    app_data["resume_url"] = generate_presigned_url_if_s3(app_data.get("resume_url"))
    return app_data


@router.get("/", response_model=list[ApplicationResponse])
async def list_applications(
    job_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List applications with profile details."""
    if current_user["role"] not in ("recruiter", "admin"):
        raise HTTPException(status_code=403, detail="Access denied.")
    
    supabase = get_supabase()
    
    # Restrict to recruiter's jobs
    if current_user["role"] == "recruiter":
        jobs_res = supabase.table("jobs").select("id").eq("recruiter_id", current_user["sub"]).execute()
        job_ids = [j["id"] for j in jobs_res.data]
        if not job_ids:
            return []
            
        query = supabase.table("applications").select("*, jobs(title, location), users(email)").in_("job_id", job_ids)
    else:
        query = supabase.table("applications").select("*, jobs(title, location), users(email)")
    
    if job_id: query = query.eq("job_id", job_id)
    if status: query = query.eq("status", status)
    
    result = query.order("created_at", desc=True).execute()
    apps = result.data
    
    # 1. Fetch all assessment IDs for these applications to ensure status sync
    app_ids = [a["id"] for a in apps] if apps else []
    if app_ids:
        # Check assessments table for any assessments linked to these application IDs (via interviews)
        assessments_res = supabase.table("assessments").select("interview_id, interviews(application_id)").execute()
        interviewed_app_ids = set()
        for ass in (assessments_res.data or []):
            inter = ass.get("interviews")
            if inter and inter.get("application_id") in app_ids:
                interviewed_app_ids.add(inter["application_id"])
    else:
        interviewed_app_ids = set()

    # Enrich with candidate full_name from profiles
    candidate_ids = list({a["candidate_id"] for a in apps if a.get("candidate_id")})
    profiles_map = {}
    if candidate_ids:
        profiles_res = supabase.table("profiles").select("id, full_name, phone").in_("id", candidate_ids).execute()
        profiles_map = {p["id"]: p for p in profiles_res.data}
    
    for app in apps:
        app["resume_url"] = generate_presigned_url_if_s3(app.get("resume_url"))
        cid = app.get("candidate_id")
        profile = profiles_map.get(cid, {})
        
        # Override status to 'interviewed' if an assessment exists but DB status is lagging
        if app.get("id") in interviewed_app_ids and app.get("status") in ("applied", "screening", "invited", "scheduled", "interviewing"):
            app["status"] = "interviewed"

        # ── Standardized Name Resolution ──
        parsed = app.get("parsed_data") or {}
        resume_name = parsed.get("name", "").strip() if isinstance(parsed, dict) else ""
        profile_name = profile.get("full_name", "").strip() or ""
        email_prefix = (app.get("users") or {}).get("email", "").split("@")[0].replace(".", " ").title()
        
        final_name = "Candidate"
        if resume_name and len(resume_name) > 1:
            final_name = resume_name
        elif profile_name and profile_name.lower() not in ("daya", "mock", "test"):
            final_name = profile_name
        elif email_prefix:
            final_name = email_prefix
            
        # CamelCase fix if needed
        if " " not in final_name and any(c.isupper() for c in final_name[1:]):
            import re
            final_name = re.sub(r'(?<!^)(?=[A-Z])', ' ', final_name).strip()

        app["candidate_name"] = final_name
        app["candidate_phone"] = profile.get("phone") or ""
    
    return apps


@router.get("/me", response_model=list[ApplicationResponse])
async def list_my_applications(
    current_user: dict = Depends(get_current_user),
):
    """List applications for the current candidate."""
    supabase = get_supabase()
    result = (
        supabase.table("applications")
        .select("*, jobs(title, location)")
        .eq("candidate_id", current_user["sub"])
        .order("created_at", desc=True)
        .execute()
    )
    apps = result.data
    for app in apps:
        app["resume_url"] = generate_presigned_url_if_s3(app.get("resume_url"))
    return apps
