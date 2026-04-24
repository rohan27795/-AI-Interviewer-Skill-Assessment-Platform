"""
Email Service — Resend SMTP integration for interview invites, confirmations, and assessments.
All styles are fully inlined as single-line strings for maximum email client compatibility
(Gmail, Outlook, Apple Mail, Yahoo).
"""
from datetime import datetime
import html
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings


async def _send_resend_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send an email via Resend SMTP with a 30-second timeout."""
    if not settings.RESEND_API_KEY:
        print("❌ RESEND_API_KEY not set.")
        return False
    try:
        print(f"📧 Sending email to {to_email} via SMTP...")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = "HireAI <hello@ashishai.in>"
        msg["To"] = to_email
        msg["Reply-To"] = "hello@ashishai.in"

        part = MIMEText(html_body, "html", "utf-8")
        msg.attach(part)

        # Connect to Resend SMTP with explicit timeout to avoid indefinite hangs
        with smtplib.SMTP_SSL("smtp.resend.com", 465, timeout=30) as server:
            server.login("resend", settings.RESEND_API_KEY)
            server.sendmail("hello@ashishai.in", to_email, msg.as_string())

        print(f"✅ Email sent successfully to {to_email}.")
        return True

    except smtplib.SMTPAuthenticationError as e:
        print(f"❌ SMTP Auth Error — check RESEND_API_KEY: {e}")
        return False
    except smtplib.SMTPRecipientsRefused as e:
        print(f"❌ Recipient refused {to_email}: {e}")
        return False
    except TimeoutError as e:
        print(f"❌ SMTP connection timed out for {to_email}: {e}")
        return False
    except Exception as e:
        print(f"❌ SMTP Resend error for {to_email}: {type(e).__name__}: {e}")
        return False


def _get_display_name(full_name: str) -> str:
    """Extract first name for friendly greetings (e.g. 'Ashish' from 'Ashish Kumar')."""
    if not full_name:
        return "Candidate"
    
    # Handle CamelCase names with no spaces (e.g. "HaydenSmith" -> "Hayden Smith")
    # This ensures "HaydenSmith" becomes "Hayden" in greetings.
    processed_name = full_name.strip()
    if " " not in processed_name:
        import re
        # Insert space before capital letters (except the first one)
        processed_name = re.sub(r'(?<!^)(?=[A-Z])', ' ', processed_name)
    
    parts = processed_name.split()
    if parts:
        return parts[0].strip()
    return "Candidate"


# ─── 1. Interview Scheduling Invite ──────────────────────────────────────────
async def send_interview_invite(
    to_email: str,
    candidate_name: str,
    match_score: int,
    schedule_link: str,
    job_title: str = "this role",
) -> bool:
    """Send shortlisted + scheduling invite to candidate."""
    print(f"📧 Building invite for {candidate_name} ({to_email})")
    first_name = _get_display_name(candidate_name)

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You are Shortlisted - HireAI</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 60%,#a855f7 100%);padding:40px 40px 32px;text-align:center;">
              <div style="display:inline-block;width:56px;height:56px;background:rgba(255,255,255,0.18);border-radius:14px;line-height:56px;font-size:28px;margin-bottom:18px;">&#127881;</div>
              <h1 style="color:#ffffff;margin:0 0 8px;font-size:26px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;">Congratulations, {first_name}!</h1>
              <p style="color:rgba(255,255,255,0.85);margin:0;font-size:15px;font-weight:400;">You have been shortlisted for {job_title}</p>
            </td>
          </tr>

          <!-- MATCH SCORE BADGE -->
          <tr>
            <td style="padding:32px 40px 0;text-align:center;">
              <div style="display:inline-block;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:1.5px solid #6ee7b7;border-radius:100px;padding:10px 28px;">
                <span style="color:#047857;font-weight:700;font-size:15px;">&#10003; {match_score}% Profile Match</span>
              </div>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:28px 40px 32px;">
              <p style="color:#334155;font-size:15px;line-height:1.75;margin:0 0 28px;">
                We reviewed your resume and you scored a <strong style="color:#4f46e5;">{match_score}% match</strong> against our requirements. We're excited to move forward with your candidacy &mdash; please schedule your AI interview at your earliest convenience.
              </p>

              <!-- INTERVIEW FORMAT TABLE -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:32px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Interview Format</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="32"><div style="width:24px;height:24px;background:#4f46e5;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">1</div></td>
                        <td style="color:#475569;font-size:14px;padding-left:10px;">Introduction &amp; Background</td>
                        <td align="right" style="color:#94a3b8;font-size:13px;">8 min</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="32"><div style="width:24px;height:24px;background:#4f46e5;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">2</div></td>
                        <td style="color:#475569;font-size:14px;padding-left:10px;">Technical Assessment</td>
                        <td align="right" style="color:#94a3b8;font-size:13px;">20 min</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="32"><div style="width:24px;height:24px;background:#4f46e5;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">3</div></td>
                        <td style="color:#475569;font-size:14px;padding-left:10px;">Behavioural &amp; HR Round</td>
                        <td align="right" style="color:#94a3b8;font-size:13px;">10 min</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="32"><div style="width:24px;height:24px;background:#4f46e5;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">4</div></td>
                        <td style="color:#475569;font-size:14px;padding-left:10px;">Salary Discussion</td>
                        <td align="right" style="color:#94a3b8;font-size:13px;">5 min</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA BUTTON -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="{schedule_link}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:12px;font-weight:700;font-size:16px;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(79,70,229,0.4);">Schedule Your Interview</a>
                  </td>
                </tr>
              </table>

              <!-- TIP BOX -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;">
                    <p style="color:#92400e;font-size:13px;font-weight:600;margin:0 0 6px;">Before your interview:</p>
                    <p style="color:#a16207;font-size:13px;line-height:1.6;margin:0;">Ensure a stable internet connection, working camera &amp; microphone, and a quiet well-lit environment. Use Chrome or Edge for the best experience.</p>
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

    subject = f"You're Shortlisted! Schedule Your AI Interview - HireAI ({match_score}% Match)"
    return await _send_resend_email(to_email, subject, html_body)


# ─── 2. Calendar / Interview Confirmation ────────────────────────────────────
async def send_calendar_invite(
    to_email: str,
    candidate_name: str,
    job_title: str,
    scheduled_at: datetime,
    interview_link: str,
) -> bool:
    """Send interview confirmation with date, time, and direct room link."""
    print(f"📧 Building calendar invite for {candidate_name} ({to_email})")
    first_name = _get_display_name(candidate_name)
    formatted_date = scheduled_at.strftime("%A, %B %d, %Y")
    formatted_time = scheduled_at.strftime("%I:%M %p IST")
    full_link = f"{settings.FRONTEND_URL}{interview_link}"

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Confirmed - HireAI</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:40px 40px 32px;text-align:center;">
              <div style="display:inline-block;width:56px;height:56px;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.35);border-radius:14px;line-height:56px;font-size:28px;margin-bottom:16px;">&#10003;</div>
              <h1 style="color:#ffffff;margin:0 0 8px;font-size:24px;font-weight:700;letter-spacing:-0.3px;">Interview Confirmed</h1>
              <p style="color:#94a3b8;margin:0;font-size:14px;">{job_title}</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:36px 40px 32px;">
              <p style="color:#334155;font-size:15px;line-height:1.75;margin:0 0 28px;">
                Hi <strong>{first_name}</strong>, your interview has been confirmed! Here are your details:
              </p>

              <!-- DETAILS TABLE -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:32px;">
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;width:36%;color:#64748b;font-size:13px;font-weight:600;">Position</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px;font-weight:600;">{job_title}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;font-weight:600;">Date</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px;font-weight:600;">{formatted_date}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;font-weight:600;">Time</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px;font-weight:600;">{formatted_time}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;font-weight:600;">Duration</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px;font-weight:600;">~45 minutes</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;color:#64748b;font-size:13px;font-weight:600;">Format</td>
                  <td style="padding:14px 20px;color:#1e293b;font-size:14px;font-weight:600;">AI Video + Voice Interview</td>
                </tr>
              </table>

              <!-- CTA BUTTON -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                  <td align="center">
                    <a href="{full_link}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:12px;font-weight:700;font-size:16px;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(79,70,229,0.4);">Join Interview Room</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:10px;">
                    <p style="color:#94a3b8;font-size:12px;margin:0;">This link activates 15 minutes before your scheduled time.</p>
                  </td>
                </tr>
              </table>

              <!-- CHECKLIST -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#f0f9ff,#eff6ff);border:1px solid #bfdbfe;border-radius:12px;padding:20px 24px;">
                    <p style="color:#1e40af;font-size:13px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Preparation Checklist</p>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr><td style="color:#3b82f6;font-size:13px;padding:4px 0;vertical-align:top;width:20px;">&#10003;</td><td style="color:#1e3a5f;font-size:13px;padding:4px 0;">Test your camera &amp; microphone beforehand</td></tr>
                      <tr><td style="color:#3b82f6;font-size:13px;padding:4px 0;vertical-align:top;">&#10003;</td><td style="color:#1e3a5f;font-size:13px;padding:4px 0;">Use Chrome or Edge for the best experience</td></tr>
                      <tr><td style="color:#3b82f6;font-size:13px;padding:4px 0;vertical-align:top;">&#10003;</td><td style="color:#1e3a5f;font-size:13px;padding:4px 0;">Find a quiet, well-lit space with stable Wi-Fi</td></tr>
                      <tr><td style="color:#3b82f6;font-size:13px;padding:4px 0;vertical-align:top;">&#10003;</td><td style="color:#1e3a5f;font-size:13px;padding:4px 0;">Review the job description once more</td></tr>
                      <tr><td style="color:#3b82f6;font-size:13px;padding:4px 0;vertical-align:top;">&#10003;</td><td style="color:#1e3a5f;font-size:13px;padding:4px 0;">Keep a glass of water handy &mdash; be yourself!</td></tr>
                    </table>
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

    subject = f"Interview Confirmed: {job_title} on {formatted_date} at {formatted_time} - HireAI"
    return await _send_resend_email(to_email, subject, html_body)


# ─── 3. Assessment Ready (Recruiter) ─────────────────────────────────────────
async def send_assessment_ready(
    to_email: str,
    recruiter_name: str,
    candidate_name: str,
    job_title: str,
    overall_score: int,
    verdict: str,
    dashboard_link: str,
    technical_score: int = 0,
    behavioral_score: int = 0,
    communication_score: int = 0,
    cultural_fit_score: int = 0,
    problem_solving_score: int = 0,
    security_summary: str = "",
) -> bool:
    """Notify recruiter that AI assessment is complete (BRD §2.6 scorecard + AI Shield)."""

    verdict_map = {
        "strong_hire": ("Strong Hire", "#059669", "#ecfdf5", "#6ee7b7", "Strong Hire"),
        "hire":        ("Hire",        "#2563eb", "#eff6ff", "#93c5fd", "Hire"),
        "no_hire":     ("No Hire",     "#dc2626", "#fef2f2", "#fca5a5", "No Hire"),
        "strong_no_hire": ("Strong No Hire", "#991b1b", "#fef2f2", "#fecaca", "Strong No Hire"),
    }
    label, color, bg, border, emoji_label = verdict_map.get(
        verdict, ("Pending Review", "#64748b", "#f8fafc", "#e2e8f0", "Pending")
    )

    safe_security = html.escape(security_summary or "No critical AI Shield alerts.")

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Assessment Complete - HireAI</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 60%,#a855f7 100%);padding:36px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0 0 8px;font-size:24px;font-weight:700;">Assessment Complete</h1>
              <p style="color:rgba(255,255,255,0.85);margin:0;font-size:14px;">{candidate_name} &bull; {job_title}</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:36px 40px 32px;">
              <p style="color:#334155;font-size:15px;line-height:1.75;margin:0 0 28px;">
                Hi <strong>{recruiter_name}</strong>, the AI-driven assessment for <strong>{candidate_name}</strong> applying for <strong>{job_title}</strong> is now ready for your review.
              </p>

              <!-- SCORE + VERDICT -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td width="48%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;text-align:center;padding:24px;vertical-align:top;">
                    <div style="font-size:48px;font-weight:800;color:#4f46e5;line-height:1;">{overall_score}</div>
                    <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-top:6px;">Overall Score</div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background:{bg};border:1.5px solid {border};border-radius:12px;text-align:center;padding:24px;vertical-align:top;">
                    <div style="font-size:18px;font-weight:700;color:{color};line-height:1;">{label}</div>
                    <div style="font-size:11px;color:{color};font-weight:500;text-transform:uppercase;letter-spacing:1px;margin-top:6px;opacity:0.75;">AI Verdict</div>
                  </td>
                </tr>
              </table>

              <!-- 5-DIMENSION BREAKDOWN -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;border-collapse:separate;border-spacing:0 8px;">
                <tr>
                  <td colspan="2" style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;">Scorecard (0–100)</td>
                </tr>
                <tr><td style="color:#334155;font-size:14px;padding:6px 0;">Technical</td><td align="right" style="font-weight:700;color:#4f46e5;">{technical_score}</td></tr>
                <tr><td style="color:#334155;font-size:14px;padding:6px 0;">Behavioral</td><td align="right" style="font-weight:700;color:#4f46e5;">{behavioral_score}</td></tr>
                <tr><td style="color:#334155;font-size:14px;padding:6px 0;">Communication</td><td align="right" style="font-weight:700;color:#4f46e5;">{communication_score}</td></tr>
                <tr><td style="color:#334155;font-size:14px;padding:6px 0;">Cultural fit</td><td align="right" style="font-weight:700;color:#4f46e5;">{cultural_fit_score}</td></tr>
                <tr><td style="color:#334155;font-size:14px;padding:6px 0;">Problem solving</td><td align="right" style="font-weight:700;color:#4f46e5;">{problem_solving_score}</td></tr>
              </table>

              <!-- AI SHIELD -->
              <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 18px;margin-bottom:28px;">
                <div style="font-size:11px;font-weight:800;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">AI Shield (security)</div>
                <p style="margin:0;color:#78350f;font-size:14px;line-height:1.6;">{safe_security}</p>
              </div>

              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="{dashboard_link}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;padding:15px 44px;border-radius:12px;font-weight:700;font-size:15px;box-shadow:0 4px 16px rgba(79,70,229,0.4);">View Full Report</a>
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

    subject = f"Assessment Ready: {candidate_name} scored {overall_score}/100 ({label}) - HireAI"
    return await _send_resend_email(to_email, subject, html_body)


# ─── 4. Candidate Scorecard Ready ───────────────────────────────────────────
async def send_candidate_scorecard_email(
    to_email: str,
    candidate_name: str,
    job_title: str,
    overall_score: int,
    scorecard_link: str,
) -> bool:
    """Notify candidate that their AI assessment scorecard is ready."""
    
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Interview Scorecard is Ready - HireAI</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9 0%,#3b82f6 60%,#6366f1 100%);padding:36px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0 0 8px;font-size:24px;font-weight:700;">Your Interview Results</h1>
              <p style="color:rgba(255,255,255,0.85);margin:0;font-size:14px;">{job_title}</p>
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="padding:36px 40px 32px;">
              <p style="color:#334155;font-size:15px;line-height:1.75;margin:0 0 28px;">
                Hi <strong>{candidate_name}</strong>, thank you for completing your HireAI interview for the <strong>{job_title}</strong> role. Your assessment report has been generated.
              </p>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;text-align:center;padding:24px;">
                    <div style="font-size:48px;font-weight:800;color:#3b82f6;line-height:1;">{overall_score}</div>
                    <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-top:6px;">Overall Score</div>
                  </td>
                </tr>
              </table>
              
              <p style="color:#334155;font-size:15px;line-height:1.75;margin:0 0 28px;">
                Click below to view your detailed scorecard, round analysis, strengths, and AI feedback.
              </p>
              
              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="{scorecard_link}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#ffffff;text-decoration:none;padding:15px 44px;border-radius:12px;font-weight:700;font-size:15px;box-shadow:0 4px 16px rgba(59,130,246,0.4);">View Scorecard</a>
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
    
    subject = f"Your Interview Results: {job_title} - HireAI"
    return await _send_resend_email(to_email, subject, html_body)

