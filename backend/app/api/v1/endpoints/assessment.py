"""Assessment API — Fetch, manage, and act on AI-generated interview scorecards."""
import asyncio
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from app.core.database import get_supabase
from app.schemas.schemas import AssessmentResponse, ApplicationStatus
from app.api.v1.endpoints.auth import get_current_user
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Columns that may not exist in older DB schemas — promote from detailed_report if missing
_OPTIONAL_COLS = (
    "communication_score", "cultural_fit_score", "problem_solving_score",
    "expected_salary", "negotiated_salary", "verdict_reasoning",
    "key_strengths", "areas_of_improvement", "round_summaries",
)


def _enrich_from_detailed_report(row: dict) -> dict:
    """Promote fields from detailed_report into top-level keys if the DB column is absent."""
    dr = row.get("detailed_report") or {}
    for col in _OPTIONAL_COLS:
        if col not in row or row[col] is None:
            if col in dr:
                row[col] = dr[col]
    return row


@router.get("/{interview_id}")
async def get_assessment(
    interview_id: str,
    request: Request,
):
    """
    Fetch the AI-generated scorecard for an interview.
    Auth is optional — the interview UUID itself is the access credential.
    """
    supabase = get_supabase()

    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("assessments").select("*")
            .eq("interview_id", interview_id)
            .maybe_single()
            .execute()
        )
        row = result.data if result else None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error fetching assessment: {exc}")

    if not row:
        try:
            interview_res = await asyncio.to_thread(
                lambda: supabase.table("interviews").select("status")
                .eq("id", interview_id)
                .maybe_single()
                .execute()
            )
            interview = interview_res.data if interview_res else None
        except Exception:
            interview = None

        if interview and interview.get("status") == "completed":
            raise HTTPException(status_code=202, detail="Assessment is being generated. Please check back in a minute.")
        elif interview and interview.get("status") == "in_progress":
            raise HTTPException(status_code=202, detail="Interview is still in progress.")
        else:
            raise HTTPException(status_code=404, detail="Assessment not found.")

    return JSONResponse(content=_enrich_from_detailed_report(row))


@router.get("/", response_model=list[AssessmentResponse])
async def list_assessments(
    job_id: str = None,
    current_user: dict = Depends(get_current_user),
):
    """List all assessments for a recruiter's jobs."""
    if current_user["role"] not in ("recruiter", "admin"):
        raise HTTPException(status_code=403, detail="Recruiter access required.")

    supabase = get_supabase()

    if current_user["role"] == "recruiter":
        jobs_res = supabase.table("jobs").select("id").eq("recruiter_id", current_user["sub"]).execute()
        job_ids = [j["id"] for j in jobs_res.data]
        if not job_ids:
            return []
            
        apps_res = supabase.table("applications").select("id").in_("job_id", job_ids).execute()
        app_ids = [a["id"] for a in apps_res.data]
        if not app_ids:
            return []
            
        interviews_res = supabase.table("interviews").select("id").in_("application_id", app_ids).execute()
        iv_ids = [i["id"] for i in interviews_res.data]
        if not iv_ids:
            return []

        query = supabase.table("assessments").select(
            "*, interviews(*, applications(*, users(email), jobs(title)))"
        ).in_("interview_id", iv_ids)
    else:
        query = supabase.table("assessments").select(
            "*, interviews(*, applications(*, users(email), jobs(title)))"
        )

    result = query.order("created_at", desc=True).execute()
    data = result.data

    # Collect candidate_ids to fetch names from profiles
    user_ids = []
    for item in data:
        inter = item.get("interviews")
        if inter:
            app = inter.get("applications")
            if app and app.get("candidate_id"):
                user_ids.append(app["candidate_id"])

    profiles_map = {}
    if user_ids:
        profiles_res = supabase.table("profiles").select("id, full_name").in_("id", list(set(user_ids))).execute()
        for p in profiles_res.data:
            profiles_map[p["id"]] = p.get("full_name") or "Unknown"

    for item in data:
        try:
            inter = item.get("interviews")
            if inter:
                app = inter.get("applications")
                if app:
                    user = app.get("users") or {}
                    # Standardized name resolution for Assessments
                    parsed = app.get("parsed_data") or {}
                    resume_name = parsed.get("name", "").strip() if isinstance(parsed, dict) else ""
                    profile_name = profiles_map.get(app.get("candidate_id"), "") or ""
                    email_prefix = user.get("email", "").split("@")[0].replace(".", " ").title()
                    
                    final_name = "Candidate"
                    if resume_name and len(resume_name) > 1:
                        final_name = resume_name
                    elif profile_name and profile_name.lower() not in ("daya", "mock", "test"):
                        final_name = profile_name
                    elif email_prefix:
                        final_name = email_prefix
                        
                    # CamelCase fix
                    if " " not in final_name and any(c.isupper() for c in final_name[1:]):
                        import re
                        final_name = re.sub(r'(?<!^)(?=[A-Z])', ' ', final_name).strip()

                    user["name"] = final_name
                    app["users"] = user
        except Exception:
            pass

    return data


@router.post("/{interview_id}/send-offer")
async def send_offer(
    interview_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Send a job offer email to the candidate for this interview.
    - Sends a beautifully formatted HTML offer email via Resend SMTP
    - Updates the application status to 'offered'
    - Updates the assessment's detailed_report with offer_sent = true
    - Idempotent: returns success if already sent (checks offer_sent flag)
    """
    if current_user["role"] not in ("recruiter", "admin"):
        raise HTTPException(status_code=403, detail="Recruiter access required.")

    supabase = get_supabase()

    # 1. Fetch assessment + interview + application + candidate + job
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("assessments").select("*")
            .eq("interview_id", interview_id)
            .maybe_single()
            .execute()
        )
        assessment_row = result.data if result else None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    if not assessment_row:
        raise HTTPException(status_code=404, detail="Assessment not found for this interview.")

    # Check if already sent (idempotency)
    dr = assessment_row.get("detailed_report") or {}
    if dr.get("offer_sent"):
        return JSONResponse(content={
            "success": True,
            "already_sent": True,
            "message": "Offer was already sent to this candidate.",
        })

    # 2. Fetch interview → application → candidate + job data
    try:
        interview_res = await asyncio.to_thread(
            lambda: supabase.table("interviews").select(
                "*, applications(*, jobs(*, recruiter:users!recruiter_id(*)), users(*))"
            ).eq("id", interview_id).single().execute()
        )
        interview_data = interview_res.data if interview_res else None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error fetching interview: {exc}")

    if not interview_data:
        raise HTTPException(status_code=404, detail="Interview record not found.")

    application = interview_data.get("applications") or {}
    job = application.get("jobs") or {}
    candidate = application.get("users") or {}

    candidate_email = candidate.get("email")
    if not candidate_email:
        raise HTTPException(status_code=422, detail="Candidate email not found — cannot send offer.")

    # Extract names and details
    candidate_name = (
        (dr.get("candidate_name") or "").strip()
        or (candidate.get("name") or "").strip()
        or candidate_email.split("@")[0].title()
    )
    job_title = (dr.get("job_title") or "").strip() or job.get("title", "the role")

    overall_score = assessment_row.get("overall_score") or dr.get("overall_score") or 0
    verdict = assessment_row.get("verdict") or "hire"

    # Salary info (from assessment negotiation or job posting)
    negotiated_salary = dr.get("negotiated_salary") or assessment_row.get("negotiated_salary")
    salary_min = job.get("salary_min") or 0
    salary_max = job.get("salary_max") or 0

    # Format salary range
    if negotiated_salary:
        salary_display = f"INR {negotiated_salary:,} per annum"
    elif salary_min and salary_max:
        salary_display = f"INR {salary_min // 100000:.1f}–{salary_max // 100000:.1f} LPA"
    else:
        salary_display = "As discussed during the interview"

    # 3. Send the offer email
    from app.services.email_service import _send_resend_email
    from app.core.config import settings

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job Offer - HireAI</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#059669 0%,#10b981 60%,#34d399 100%);padding:40px 40px 32px;text-align:center;">
              <div style="display:inline-block;width:64px;height:64px;background:rgba(255,255,255,0.2);border-radius:50%;line-height:64px;font-size:32px;margin-bottom:16px;">&#127881;</div>
              <h1 style="color:#ffffff;margin:0 0 8px;font-size:28px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">Congratulations, {candidate_name}!</h1>
              <p style="color:rgba(255,255,255,0.9);margin:0;font-size:16px;font-weight:400;">We are thrilled to offer you a position at our company</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:36px 40px 32px;">

              <p style="color:#334155;font-size:15px;line-height:1.8;margin:0 0 28px;">
                Dear <strong>{candidate_name}</strong>,<br><br>
                Following your impressive performance in the AI interview for the <strong>{job_title}</strong> role
                (overall score: <strong style="color:#059669;">{int(overall_score)}/100</strong>),
                we are delighted to extend this formal offer of employment.
              </p>

              <!-- OFFER DETAILS -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;overflow:hidden;margin-bottom:32px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #bbf7d0;">
                    <p style="margin:0;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#15803d;">Offer Details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr style="border-bottom:1px solid #bbf7d0;">
                        <td style="padding:14px 20px;color:#64748b;font-size:13px;font-weight:600;width:40%;">Position</td>
                        <td style="padding:14px 20px;color:#1e293b;font-size:14px;font-weight:700;">{job_title}</td>
                      </tr>
                      <tr style="border-bottom:1px solid #bbf7d0;">
                        <td style="padding:14px 20px;color:#64748b;font-size:13px;font-weight:600;">Compensation</td>
                        <td style="padding:14px 20px;color:#059669;font-size:14px;font-weight:700;">{salary_display}</td>
                      </tr>
                      <tr style="border-bottom:1px solid #bbf7d0;">
                        <td style="padding:14px 20px;color:#64748b;font-size:13px;font-weight:600;">Start Date</td>
                        <td style="padding:14px 20px;color:#1e293b;font-size:14px;font-weight:600;">To be discussed</td>
                      </tr>
                      <tr>
                        <td style="padding:14px 20px;color:#64748b;font-size:13px;font-weight:600;">Employment Type</td>
                        <td style="padding:14px 20px;color:#1e293b;font-size:14px;font-weight:600;">Full-Time</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color:#334155;font-size:15px;line-height:1.75;margin:0 0 24px;">
                Please review the full offer details in the HireAI portal and confirm your acceptance.
                If you have any questions or would like to discuss the terms, please reply to this email.
              </p>

              <!-- CTA BUTTON -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="{settings.FRONTEND_URL}" style="display:inline-block;background:linear-gradient(135deg,#059669,#10b981);color:#ffffff;text-decoration:none;padding:16px 52px;border-radius:12px;font-weight:700;font-size:16px;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(5,150,105,0.4);">Accept Offer</a>
                  </td>
                </tr>
              </table>

              <!-- CONGRATS NOTE -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;">
                    <p style="color:#92400e;font-size:13px;font-weight:600;margin:0 0 4px;">What happens next?</p>
                    <p style="color:#a16207;font-size:13px;line-height:1.6;margin:0;">Our HR team will reach out within 2 business days to finalize the joining formalities, documents, and start date. We look forward to having you on board!</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="color:#64748b;font-size:13px;margin:0 0 4px;font-weight:600;">Powered by HireAI</p>
              <p style="color:#94a3b8;font-size:12px;margin:0;">AI-Powered Recruitment Platform &bull; <a href="https://ashishai.in" style="color:#6366f1;text-decoration:none;">ashishai.in</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    subject = f"Job Offer: {job_title} — HireAI"
    email_sent = await _send_resend_email(candidate_email, subject, html_body)

    if not email_sent:
        raise HTTPException(status_code=502, detail="Failed to send offer email. Check RESEND_API_KEY and try again.")

    # 4. Update assessment — mark offer_sent = true in detailed_report
    try:
        updated_dr = dict(dr)
        updated_dr["offer_sent"] = True
        updated_dr["offer_sent_at"] = __import__("datetime").datetime.utcnow().isoformat()
        updated_dr["offer_sent_by"] = current_user.get("id", "unknown")
        await asyncio.to_thread(
            lambda: supabase.table("assessments").update({
                "detailed_report": updated_dr
            }).eq("interview_id", interview_id).execute()
        )
    except Exception as e:
        logger.warning(f"Could not update offer_sent flag: {e}")

    # 5. Update application status to 'offered'
    app_id = application.get("id")
    if app_id:
        try:
            await asyncio.to_thread(
                lambda: supabase.table("applications").update({
                    "status": ApplicationStatus.OFFERED.value
                }).eq("id", app_id).execute()
            )
        except Exception as e:
            logger.warning(f"Could not update application status to offered: {e}")

    logger.info(f"[Offer] Sent offer email to {candidate_email} for interview {interview_id}")

    return JSONResponse(content={
        "success": True,
        "already_sent": False,
        "message": f"Offer email successfully sent to {candidate_email}.",
        "candidate_email": candidate_email,
        "candidate_name": candidate_name,
        "job_title": job_title,
    })
