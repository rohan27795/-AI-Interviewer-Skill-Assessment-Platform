"""Scheduling endpoints — slot listing and booking."""
import uuid
from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, HTTPException
from app.core.database import get_supabase
from app.schemas.schemas import TimeSlot, BookSlotRequest, ScheduleResponse
from app.services.email_service import send_calendar_invite

router = APIRouter()


def generate_slots(days_ahead: int = 7) -> List[TimeSlot]:
    """Generate available 45-min interview slots for the next N days (9 AM – 6 PM IST)."""
    slots = []
    now = datetime.utcnow()
    
    for day_offset in range(1, days_ahead + 1):
        day = now + timedelta(days=day_offset)
        if day.weekday() >= 5:  # Skip weekends
            continue
        
        for hour in range(9, 18):  # 9 AM to 5 PM
            for minute in [0, 30]:  # Every 30 mins
                start = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
                slots.append(TimeSlot(
                    slot_id=f"{start.strftime('%Y%m%d-%H%M')}",
                    start_time=start,
                    end_time=start + timedelta(minutes=45),
                    available=True,
                ))
    
    return slots[:20]  # Return first 20 slots


@router.get("/slots", response_model=List[TimeSlot])
async def get_available_slots(application_id: str):
    """Get available interview time slots."""
    supabase = get_supabase()
    
    from app.core.config import settings
    # Verify application exists and meets threshold
    app = supabase.table("applications").select("id, status, ai_score").eq("id", application_id).execute()
    if not app.data:
        raise HTTPException(status_code=404, detail="Application not found.")
    
    ai_score = app.data[0].get("ai_score") or 0.0
    if ai_score < settings.MATCH_THRESHOLD:
        raise HTTPException(status_code=403, detail="Your fit score does not meet the minimum requirement to schedule an interview.")
    
    # Get already-booked slots to exclude
    booked = supabase.table("interviews").select("scheduled_at").eq("status", "scheduled").execute()
    booked_times = {row["scheduled_at"] for row in (booked.data or [])}
    
    slots = generate_slots()
    for slot in slots:
        if slot.start_time.isoformat() in booked_times:
            slot.available = False
    
    return [s for s in slots if s.available]


@router.post("/book", response_model=ScheduleResponse)
async def book_slot(data: BookSlotRequest):
    """Book an interview slot."""
    supabase = get_supabase()
    
    # ── Step 1: Verify the application exists (SIMPLE query, no joins) ──
    try:
        app_result = supabase.table("applications").select(
            "id, candidate_id, job_id"
        ).eq("id", data.application_id).single().execute()
    except Exception as e:
        print(f"ERROR book_slot: application query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Could not find application: {e}")
    
    if not app_result.data:
        raise HTTPException(status_code=404, detail="Application not found.")
    
    application = app_result.data
    candidate_id = application["candidate_id"]
    job_id = application["job_id"]
    
    # ── Step 2: Get candidate name + email separately (simple queries) ──
    candidate_email = ""
    candidate_name = ""
    job_title = "Interview"
    
    try:
        user_row = supabase.table("users").select("email").eq("id", candidate_id).single().execute()
        if user_row.data:
            candidate_email = user_row.data.get("email", "")
    except Exception as e:
        print(f"WARN book_slot: user query failed: {e}")
    
    try:
        profile_row = supabase.table("profiles").select("full_name").eq("id", candidate_id).single().execute()
        if profile_row.data:
            candidate_name = profile_row.data.get("full_name", "")
    except Exception as e:
        print(f"WARN book_slot: profile query failed: {e}")
    
    # Fallback to email local part if name is missing
    if not candidate_name and candidate_email:
        candidate_name = candidate_email.split("@")[0].replace(".", " ").title()
    if not candidate_name:
        candidate_name = "Candidate"
    
    try:
        job_row = supabase.table("jobs").select("title").eq("id", job_id).single().execute()
        if job_row.data:
            job_title = job_row.data.get("title", "Interview")
    except Exception as e:
        print(f"WARN book_slot: job query failed: {e}")
    
    # ── Step 3: Parse slot time ──
    try:
        scheduled_at = datetime.strptime(data.slot_id, "%Y%m%d-%H%M")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid slot ID format.")
    
    # ── Step 4: Create interview record ──
    interview_id = str(uuid.uuid4())
    unique_token = str(uuid.uuid4()).replace("-", "")
    interview_link = f"/candidate/room/{interview_id}?token={unique_token}"
    
    try:
        supabase.table("interviews").insert({
            "id": interview_id,
            "application_id": data.application_id,
            "scheduled_at": scheduled_at.isoformat(),
            "status": "scheduled",
            "unique_link": unique_token,
        }).execute()
    except Exception as e:
        print(f"ERROR book_slot: interview insert failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create interview: {e}")
    
    # ── Step 5: Update application status to 'scheduled' ──
    try:
        supabase.table("applications").update(
            {"status": "scheduled"}
        ).eq("id", data.application_id).execute()
    except Exception as e:
        # If this fails it's likely the DB CHECK constraint issue
        print(f"ERROR book_slot: status update failed (CHECK constraint?): {e}")
        # Don't crash — interview was already created
    
    # ── Step 6: Send calendar invite (NEVER block booking) ──
    calendar_sent = False
    try:
        await send_calendar_invite(
            to_email=candidate_email,
            candidate_name=candidate_name,
            job_title=job_title,
            scheduled_at=scheduled_at,
            interview_link=interview_link,
        )
        calendar_sent = True
    except Exception as e:
        print(f"WARN book_slot: calendar invite failed (non-fatal): {e}")
    
    return ScheduleResponse(
        interview_id=interview_id,
        scheduled_at=scheduled_at,
        unique_link=interview_link,
        calendar_invite_sent=calendar_sent,
    )
