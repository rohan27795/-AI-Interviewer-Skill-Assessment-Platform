"""
Assessment Generator Service
Analyzes full interview transcripts to produce comprehensive scorecards.

Key logic:
- Scores ONLY dimensions that correspond to rounds that actually occurred.
- Handles three termination cases: completed, early_exit, tab_guard.
- Enforces minimum content threshold to prevent AI score fabrication.
"""
from datetime import datetime
import uuid
import json
from typing import Any, Dict, List, Optional, Tuple
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.database import get_supabase
from app.schemas.schemas import HireVerdict, InterviewStatus, ApplicationStatus
from app.services.email_service import send_assessment_ready, send_candidate_scorecard_email
import logging
import asyncio
from langfuse import observe

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


# ── Dimension weights for overall_score ───────────────────────────────────────
# Weights reflect importance of each assessment dimension.
# If a round didn't happen (score is null), its weight is redistributed
# proportionally among the dimensions that *were* scored.
DIMENSION_WEIGHTS: dict = {
    "technical_score":      0.30,  # Hardest to fake — most predictive of job performance
    "problem_solving_score": 0.25, # Closely tied to technical depth
    "behavioral_score":     0.20,  # Cultural & leadership signals
    "communication_score":  0.15,  # Always scorable if candidate spoke
    "cultural_fit_score":   0.10,  # Softest signal — lowest weight
}


# ── Prompt template ───────────────────────────────────────────────────────────

ASSESSMENT_PROMPT = """
You are an expert talent assessment AI. Analyze the interview transcript below and generate scores.

SCORING RULES:
1. If a round occurred (has transcript turns), you MUST provide a numeric score (0-100). Do NOT use null for rounds that occurred.
2. Use null ONLY if a round literally did not happen (zero turns for that round in the transcript).
3. Base scores on the actual quality of candidate responses. Short or vague answers = low scores (20-40), not null.
4. "Bye", "Thank you", filler words, and partial sentences are normal in speech-to-text transcripts. Focus on the substantive content.
5. Score each dimension honestly based on available evidence. Even brief evidence warrants a score.
6. communication_score should ALWAYS have a value if the candidate spoke at all.

Job Title: {job_title}
Candidate Name: {candidate_name}
Interview Duration: {duration} minutes
Total Transcript Turns: {total_turns}
Candidate Response Turns: {candidate_turns}
AI Question Turns: {ai_turns}
Rounds Actually Conducted: {rounds_conducted}
Termination Reason: {termination_reason}

Full Transcript:
{transcript}

AI Shield / Proctoring Events:
{proctoring_logs}

Raw Proctoring JSON:
{proctoring_logs_json}

Generate a JSON assessment with this EXACT schema:
{{
  "overall_score": float (0-100),
  "technical_score": float (0-100) or null if technical round did not occur,
  "behavioral_score": float (0-100) or null if behavioral round did not occur,
  "communication_score": float (0-100) — always score this if candidate spoke,
  "cultural_fit_score": float (0-100) or null if no intro/behavioral round,
  "problem_solving_score": float (0-100) or null if no technical round,

  "completion_status": "completed" | "early_exit" | "tab_guard",
  "rounds_completed": list of round names that had content,
  "total_turns_assessed": integer,

  "verdict": "strong_hire" | "hire" | "no_hire" | "strong_no_hire",
  "verdict_reasoning": "2-3 sentences with evidence from transcript.",

  "key_strengths": ["List strengths observed in the transcript"],
  "areas_of_improvement": ["List areas where candidate could improve"],

  "technical_highlights": ["Key technical points if technical round occurred"],
  "technical_concerns": ["Technical gaps if technical round occurred"],
  "behavioral_highlights": ["Key behavioral points if behavioral round occurred"],

  "expected_salary": integer (INR) or null,
  "negotiated_salary": integer (INR) or null,
  "salary_notes": "string",

  "security_report": {{
    "shield_alert_timeline": ["Timestamped alert lines. Empty array if no issues."],
    "suspicious_activities": ["Short bullets. Empty list if clean."],
    "tab_switches": integer,
    "face_alerts": integer,
    "integrity_score": float (0-100, 100 = no violations),
    "final_security_verdict": "clear" | "minor_flags" | "major_violations"
  }},

  "round_summaries": [
    {{
      "round": "intro|technical|behavioral|salary",
      "score": float (0-100),
      "duration_estimate_mins": integer,
      "key_takeaways": ["From actual transcript content"],
      "red_flags": ["list, empty if none"]
    }}
  ],

  "hiring_recommendation": "1-2 paragraph recommendation for the recruiter. The sentence MUST be grammatically complete and self-contained. Use a full phrase such as: 'I recommend moving forward with this candidate' OR 'I do not recommend moving forward with this candidate' OR 'I recommend against proceeding with this candidate'. Never write a fragment like 'I would recommend with this candidate' — always include the direction word (moving forward / against / proceeding). Do not omit critical words.",
  "suggested_onboarding_notes": "string or empty"
}}

Additional scoring guidance:
- Tab guard termination: integrity_score <= 30, verdict = "no_hire" or "strong_no_hire".
- Early exit with very few turns (< 6): use conservative scores (15-35 range) rather than null.
- Short interviews (6-14 turns): scores should be conservative (cap at 65).
- Ignore "Bye", "Bye-bye", "Thank you" as these are speech recognition artifacts.
- Return ONLY valid JSON.
"""



# ── Transcript analysis ───────────────────────────────────────────────────────

def _analyze_transcript(transcript: List[Dict]) -> Dict[str, Any]:
    """
    Parse the transcript and return structured metadata:
    - which rounds occurred
    - how many turns per round
    - total AI and candidate turns
    """
    rounds_seen = {}  # round_name -> {"ai": int, "candidate": int}
    total_turns = 0

    for entry in transcript or []:
        if not isinstance(entry, dict):
            continue
        phase = (entry.get("phase") or entry.get("round") or "unknown").lower()
        speaker = entry.get("speaker", "unknown").lower()
        text = (entry.get("text") or "").strip()
        if not text:
            continue
        total_turns += 1
        if phase not in rounds_seen:
            rounds_seen[phase] = {"ai": 0, "candidate": 0}
        if speaker == "ai":
            rounds_seen[phase]["ai"] += 1
        elif speaker == "candidate":
            rounds_seen[phase]["candidate"] += 1

    # A round "occurred" if the AI spoke at least once in it
    rounds_conducted = [
        r for r, counts in rounds_seen.items()
        if counts["ai"] >= 1 and r != "unknown"
    ]

    candidate_turns = sum(v["candidate"] for v in rounds_seen.values())
    ai_turns = sum(v["ai"] for v in rounds_seen.values())

    return {
        "total_turns": total_turns,
        "candidate_turns": candidate_turns,
        "ai_turns": ai_turns,
        "rounds_seen": rounds_seen,
        "rounds_conducted": rounds_conducted,
        "has_technical": "technical" in rounds_conducted,
        "has_behavioral": "behavioral" in rounds_conducted,
        "has_salary": "salary" in rounds_conducted,
        "has_intro": "intro" in rounds_conducted,
    }


def _format_transcript_for_llm(transcript: List[Dict]) -> str:
    """Normalize transcript rows from realtime (uses `round`) or legacy (`phase`)."""
    lines: List[str] = []
    for entry in transcript or []:
        if not isinstance(entry, dict):
            continue
        phase = entry.get("phase") or entry.get("round") or "unknown"
        speaker = entry.get("speaker", "unknown")
        text = (entry.get("text") or "").strip()
        if not text:
            continue
        ts = entry.get("timestamp", "")
        prefix = f"[{ts}] " if ts else ""
        lines.append(f"{prefix}[{str(phase).upper()} | {str(speaker).upper()}]: {text}")
    body = "\n\n".join(lines)
    return body if body else "(No transcript lines — manual review required.)"


def _format_proctoring_for_llm(logs: List[Dict]) -> Tuple[str, str]:
    """Human timeline + raw JSON snippet for the model."""
    raw_json = json.dumps(logs or [], default=str)
    if not logs:
        return "No AI Shield integrity events were recorded during this session.", raw_json[:8000]

    timeline: List[str] = []
    for log in logs:
        if not isinstance(log, dict):
            continue
        ts = log.get("timestamp", "")
        ev = log.get("event", "integrity")
        msg = log.get("message")
        if not msg:
            msg = json.dumps({k: v for k, v in log.items() if k != "timestamp"}, default=str)
        sev = log.get("severity", "info")
        faces = log.get("faces")
        extra = ""
        if faces is not None:
            extra = f" faces_in_frame={faces}"
        timeline.append(f"[{ts}] AI Shield | {ev} | severity={sev}{extra} — {msg}")

    body = "\n".join(timeline) if timeline else "Events present but unparsed."
    return body[:6000], raw_json[:8000]


# ── Main service class ────────────────────────────────────────────────────────

class AssessmentGeneratorService:
    """Generates post-interview assessments using GPT-4o analysis."""

    @observe()
    async def generate_assessment(
        self,
        interview_id: str,
        transcript: List[Dict],
        proctoring_logs: List[Dict],
        job_data: Dict,
        resume_data: Dict,
        duration_minutes: int,
        termination_reason: str = "completed",
    ) -> Dict[str, Any]:
        """Generate a candidate assessment from the interview transcript and security logs."""

        # ── Pre-flight: analyze what actually happened ────────────────────────
        analysis = _analyze_transcript(transcript)
        total_turns = analysis["total_turns"]
        rounds_conducted = analysis["rounds_conducted"]

        logger.info(
            f"[Assessment] interview={interview_id} | turns={total_turns} | "
            f"rounds={rounds_conducted} | termination={termination_reason}"
        )

        # ── Tab-guard: skip LLM, return immediate disqualification ────────────
        if termination_reason == "tab_guard":
            return self._tab_guard_assessment(
                interview_id, transcript, proctoring_logs, analysis, job_data, resume_data
            )

        # ── Insufficient data: too few conversation turns ──────────────────────
        # We check total turns but also consider if AI spoke enough (candidate
        # transcript was previously broken so we can't gate solely on candidate turns)
        ai_turns = analysis["ai_turns"]
        candidate_turns = analysis["candidate_turns"]
        # Minimum viable: AI must have spoken at least 3 times (= 3 questions asked)
        # If candidate turns are 0 but AI spoke >= 3 times, something went wrong with
        # transcription — still attempt LLM scoring rather than giving 0/100
        insufficient = total_turns < 4 or (ai_turns < 3 and candidate_turns < 2)
        if insufficient:
            return self._insufficient_data_assessment(
                interview_id, transcript, proctoring_logs, analysis, job_data, resume_data,
                termination_reason
            )

        # ── Normal path: call LLM with enriched context ───────────────────────
        formatted_transcript = _format_transcript_for_llm(transcript)
        formatted_logs, logs_json = _format_proctoring_for_llm(proctoring_logs or [])

        prompt = ASSESSMENT_PROMPT.format(
            job_title=job_data.get("title", "Unknown Role"),
            candidate_name=(resume_data.get("name") if isinstance(resume_data, dict) else None) or "Candidate",
            duration=duration_minutes,
            total_turns=total_turns,
            candidate_turns=candidate_turns,
            ai_turns=ai_turns,
            rounds_conducted=", ".join(rounds_conducted) if rounds_conducted else "none",
            termination_reason=termination_reason,
            transcript=formatted_transcript[:12000],
            proctoring_logs=formatted_logs[:6000],
            proctoring_logs_json=logs_json[:8000],
        )

        try:
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4000,
                temperature=0.2,
                response_format={"type": "json_object"},
            )

            raw = response.choices[0].message.content
            assessment = json.loads(raw)
            assessment["interview_id"] = interview_id

            # Clamp all numeric scores to [0, 100]; preserve null for unscored dimensions
            score_keys = (
                "overall_score", "technical_score", "behavioral_score",
                "communication_score", "cultural_fit_score", "problem_solving_score",
            )
            for key in score_keys:
                val = assessment.get(key)
                if val is None:
                    assessment[key] = None  # keep null — round not assessed
                else:
                    try:
                        assessment[key] = max(0.0, min(100.0, float(val)))
                    except (ValueError, TypeError):
                        assessment[key] = None

            # Enforce: if technical round didn't happen, null out tech scores
            if not analysis["has_technical"]:
                assessment["technical_score"] = None
                assessment["problem_solving_score"] = None
            if not analysis["has_behavioral"]:
                assessment["behavioral_score"] = None
            # cultural_fit can come from intro OR behavioral round signals.
            # Only null it out if NEITHER the intro nor the behavioral round occurred.
            if not analysis["has_behavioral"] and not analysis["has_intro"]:
                assessment["cultural_fit_score"] = None

            # ── Weighted overall_score (renormalized over scored dims only) ──
            # Only include dimensions where a score exists (round actually occurred).
            # Remaining weights are proportionally redistributed so total = 1.0.
            weighted_sum = 0.0
            total_weight = 0.0
            for dim, w in DIMENSION_WEIGHTS.items():
                val = assessment.get(dim)
                if val is not None:
                    weighted_sum += float(val) * w
                    total_weight += w

            if total_weight > 0:
                # Renormalize: divide by actual total weight (not 1.0) so
                # missing dimensions don't drag the score toward 0.
                assessment["overall_score"] = round(weighted_sum / total_weight, 1)
            else:
                assessment["overall_score"] = 0.0

            # Cap overall for early_exit based on how many rounds were completed
            # 0 rounds = max 20, 1 round = max 35, 2 rounds = max 55, 3 rounds = max 75, 4 = no cap
            if termination_reason == "early_exit":
                rounds_done_count = len(rounds_conducted)
                round_caps = {0: 20.0, 1: 35.0, 2: 55.0, 3: 75.0}
                cap = round_caps.get(rounds_done_count, 100.0)
                if assessment["overall_score"] is not None:
                    assessment["overall_score"] = min(float(assessment["overall_score"]), cap)

            # Normalize security_report
            sr = assessment.get("security_report")
            if not isinstance(sr, dict):
                sr = {}
            if "shield_alert_timeline" not in sr:
                sr["shield_alert_timeline"] = sr.get("suspicious_activities") or []
            assessment["security_report"] = sr

            # Validate verdict
            valid_verdicts = {v.value for v in HireVerdict}
            if assessment.get("verdict") not in valid_verdicts:
                assessment["verdict"] = self._compute_verdict_from_score(
                    float(assessment.get("overall_score") or 0)
                )

            # Downgrade verdict on security violations
            sec_verdict = (sr.get("final_security_verdict") or "clear").lower()
            if sec_verdict == "major_violations" and assessment.get("verdict") in ("strong_hire", "hire"):
                assessment["verdict"] = HireVerdict.NO_HIRE.value
                assessment["verdict_reasoning"] = (
                    (assessment.get("verdict_reasoning") or "")
                    + " Verdict capped due to major AI Shield integrity flags."
                ).strip()

            # Embed analysis metadata
            assessment["completion_status"] = termination_reason
            assessment["rounds_completed"] = rounds_conducted
            assessment["total_turns_assessed"] = total_turns

            return assessment

        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Assessment generation failed: {e}")
            return self._fallback_assessment(
                interview_id, transcript, proctoring_logs or [], analysis, termination_reason
            )

    # ── Verdict helpers ───────────────────────────────────────────────────────

    def _compute_verdict_from_score(self, score: float) -> str:
        """
        Score-to-verdict mapping.
        85+  → strong_hire    (top tier)
        70+  → hire           (clearly qualified)
        50+  → no_hire        (borderline — recruiter may still review)
        <50  → strong_no_hire (significant gaps)
        """
        if score >= 85:
            return HireVerdict.STRONG_HIRE.value
        elif score >= 70:
            return HireVerdict.HIRE.value
        elif score >= 50:
            return HireVerdict.NO_HIRE.value
        else:
            return HireVerdict.STRONG_NO_HIRE.value

    # ── Specialized assessment builders ──────────────────────────────────────

    def _tab_guard_assessment(
        self,
        interview_id: str,
        transcript: List[Dict],
        proctoring_logs: List[Dict],
        analysis: Dict,
        job_data: Dict,
        resume_data: Dict,
    ) -> Dict:
        """Immediate disqualification scorecard for tab-switch termination."""
        tab_switches = sum(1 for e in proctoring_logs if e.get("event") == "tab_switch")
        face_alerts = sum(1 for e in proctoring_logs if e.get("event") == "proctoring_alert")
        formatted_logs, _ = _format_proctoring_for_llm(proctoring_logs)

        candidate_name = (
            (resume_data.get("name") or "") if isinstance(resume_data, dict) else ""
        ) or "Candidate"
        job_title = job_data.get("title", "Unknown Role")

        return {
            "interview_id": interview_id,
            "completion_status": "tab_guard",
            "rounds_completed": analysis.get("rounds_conducted", []),
            "total_turns_assessed": analysis["total_turns"],
            # All skill scores null — interview terminated before fair assessment
            "overall_score": 0.0,
            "technical_score": None,
            "behavioral_score": None,
            "communication_score": None,
            "cultural_fit_score": None,
            "problem_solving_score": None,
            "verdict": HireVerdict.STRONG_NO_HIRE.value,
            "verdict_reasoning": (
                f"Interview for {candidate_name} ({job_title}) was automatically terminated by the "
                f"AI Shield proctoring system after detecting {tab_switches} tab switch(es). "
                "Skill scores are not generated for terminated sessions to prevent unfair assessment of partial data."
            ),
            "key_strengths": [],
            "areas_of_improvement": [
                "Interview was terminated due to a proctoring violation (tab switch detected).",
                "No performance assessment could be completed.",
            ],
            "technical_highlights": [],
            "technical_concerns": ["Interview terminated before technical round."],
            "behavioral_highlights": [],
            "expected_salary": None,
            "negotiated_salary": None,
            "salary_notes": "Salary round not reached due to termination.",
            "security_report": {
                "shield_alert_timeline": formatted_logs.split("\n")[:20] if formatted_logs else [],
                "suspicious_activities": [
                    f"Tab switch detected — interview terminated automatically. ({tab_switches} switches)",
                ],
                "tab_switches": tab_switches,
                "face_alerts": face_alerts,
                "integrity_score": 0.0,
                "final_security_verdict": "major_violations",
            },
            "round_summaries": [],
            "hiring_recommendation": (
                "This candidate's interview was terminated by the AI Shield proctoring system due to "
                f"{tab_switches} tab switch(es). The system enforces a strict no-switch policy during "
                "interviews. A hiring decision cannot be made based on this session. You may choose to "
                "invite the candidate for a new interview session."
            ),
            "suggested_onboarding_notes": "",
            "candidate_name": candidate_name,
            "job_title": job_title,
        }

    def _insufficient_data_assessment(
        self,
        interview_id: str,
        transcript: List[Dict],
        proctoring_logs: List[Dict],
        analysis: Dict,
        job_data: Dict,
        resume_data: Dict,
        termination_reason: str,
    ) -> Dict:
        """Scorecard for sessions with too few turns to score fairly."""
        candidate_name = (
            (resume_data.get("name") or "") if isinstance(resume_data, dict) else ""
        ) or "Candidate"
        job_title = job_data.get("title", "Unknown Role")
        total_turns = analysis["total_turns"]
        tab_switches = sum(1 for e in proctoring_logs if e.get("event") == "tab_switch")
        face_alerts = sum(1 for e in proctoring_logs if e.get("event") == "proctoring_alert")

        return {
            "interview_id": interview_id,
            "completion_status": termination_reason,
            "rounds_completed": analysis.get("rounds_conducted", []),
            "total_turns_assessed": total_turns,
            "overall_score": 0.0,
            "technical_score": None,
            "behavioral_score": None,
            "communication_score": None,
            "cultural_fit_score": None,
            "problem_solving_score": None,
            "verdict": HireVerdict.NO_HIRE.value,
            "verdict_reasoning": (
                f"The interview was too brief to generate a reliable assessment. "
                f"Only {total_turns} conversation turn(s) were recorded. "
                "A minimum of 3 turns is required for even a basic evaluation."
            ),
            "key_strengths": [],
            "areas_of_improvement": [
                "Interview session was too short for evaluation.",
                "Candidate should be invited to complete a full interview.",
            ],
            "technical_highlights": [],
            "technical_concerns": [],
            "behavioral_highlights": [],
            "expected_salary": None,
            "negotiated_salary": None,
            "salary_notes": "Salary round not reached.",
            "security_report": {
                "shield_alert_timeline": [],
                "suspicious_activities": [],
                "tab_switches": tab_switches,
                "face_alerts": face_alerts,
                "integrity_score": 100.0 if tab_switches == 0 else max(0, 100 - tab_switches * 25),
                "final_security_verdict": "major_violations" if tab_switches > 0 else "clear",
            },
            "round_summaries": [],
            "hiring_recommendation": (
                f"This session contained only {total_turns} turn(s) and cannot support a fair "
                "candidate evaluation. The interviewer recommends scheduling a new full-length interview."
            ),
            "suggested_onboarding_notes": "",
            "candidate_name": candidate_name,
            "job_title": job_title,
        }

    def _fallback_assessment(
        self,
        interview_id: str,
        transcript: List[Dict],
        proctoring_logs: List[Dict],
        analysis: Dict,
        termination_reason: str,
    ) -> Dict:
        """Return a minimal assessment if AI generation fails."""
        tab_switches = sum(1 for e in proctoring_logs if e.get("event") == "tab_switch")
        face_alerts = sum(1 for e in proctoring_logs if e.get("event") == "proctoring_alert")
        formatted_logs, _ = _format_proctoring_for_llm(proctoring_logs)
        return {
            "interview_id": interview_id,
            "completion_status": termination_reason,
            "rounds_completed": analysis.get("rounds_conducted", []),
            "total_turns_assessed": analysis.get("total_turns", 0),
            "overall_score": 0.0,
            "technical_score": None,
            "behavioral_score": None,
            "communication_score": None,
            "cultural_fit_score": None,
            "problem_solving_score": None,
            "verdict": HireVerdict.NO_HIRE.value,
            "verdict_reasoning": "Assessment generation failed. Manual review required.",
            "key_strengths": [],
            "areas_of_improvement": [],
            "technical_highlights": [],
            "technical_concerns": [],
            "behavioral_highlights": [],
            "expected_salary": None,
            "negotiated_salary": None,
            "salary_notes": "",
            "round_summaries": [],
            "hiring_recommendation": "Manual review required — automated assessment failed.",
            "suggested_onboarding_notes": "",
            "security_report": {
                "shield_alert_timeline": formatted_logs.split("\n")[:20] if proctoring_logs else [],
                "suspicious_activities": ["Automated assessment unavailable — review raw logs."],
                "tab_switches": tab_switches,
                "face_alerts": face_alerts,
                "integrity_score": 50.0,
                "final_security_verdict": "minor_flags",
            },
            "raw_proctoring_logs": proctoring_logs,
        }

    async def generate_email_summary(
        self, assessment: Dict, candidate_name: str, job_title: str
    ) -> str:
        """Generate a recruiter-friendly email summary of the assessment."""
        verdict_map = {
            "strong_hire": "Strong Hire",
            "hire": "Hire",
            "no_hire": "No Hire",
            "strong_no_hire": "Strong No Hire",
        }
        verdict_label = verdict_map.get(assessment.get("verdict", ""), "Pending")
        status = assessment.get("completion_status", "completed")
        status_label = {
            "completed": "Completed",
            "early_exit": "Early Exit",
            "tab_guard": "TERMINATED — Tab Switch Detected",
        }.get(status, status.title())

        def fmt_score(key: str) -> str:
            v = assessment.get(key)
            return f"{int(v)}/100" if v is not None else "N/A"

        return f"""
HireAI Assessment Report — {candidate_name}
Role: {job_title}
Session Status: {status_label}

VERDICT: {verdict_label}
Overall Score: {fmt_score('overall_score')}

Score Breakdown (assessed dimensions only):
• Technical: {fmt_score('technical_score')}
• Behavioral: {fmt_score('behavioral_score')}
• Communication: {fmt_score('communication_score')}
• Cultural Fit: {fmt_score('cultural_fit_score')}
• Problem Solving: {fmt_score('problem_solving_score')}

Key Strengths:
{chr(10).join(f"• {s}" for s in assessment.get('key_strengths', [])) or "• N/A — insufficient interview data"}

Hiring Recommendation:
{assessment.get('hiring_recommendation', '')}

View full report: {settings.FRONTEND_URL}/recruiter/assessments/{assessment.get('interview_id')}
"""


# ── Singleton ─────────────────────────────────────────────────────────────────
assessment_generator = AssessmentGeneratorService()


# ── Background task entry point ───────────────────────────────────────────────

async def generate_assessment(
    interview_id: str,
    transcript: List[Dict],
    proctoring_logs: List[Dict] = None,
    termination_reason: str = "completed",
):
    """
    Background Task:
    1. Fetch interview/job/candidate data
    2. Run AI assessment analysis (with termination-aware logic)
    3. Save results to Supabase 'assessments' table
    4. Update application/interview status
    5. Notify recruiter + candidate via email
    """
    supabase = get_supabase()

    try:
        # Deduplicate — skip if already generated
        existing = supabase.table("assessments").select("id").eq("interview_id", interview_id).execute()
        if existing.data:
            logger.info(f"Assessment already exists for interview {interview_id}; skipping.")
            return

        proctoring_logs = proctoring_logs or []

        # 1. Fetch interview + related data
        res = supabase.table("interviews").select(
            "*, applications(*, jobs(*, recruiter:users!recruiter_id(*)), users(*))"
        ).eq("id", interview_id).single().execute()

        if not res.data:
            logger.error(f"Interview {interview_id} not found for assessment")
            return

        data = res.data
        application = data["applications"]
        job = application.get("jobs") or {}
        candidate = application.get("users") or {}
        recruiter = job.get("recruiter") or {}

        # Prefer persisted rows if background task received an empty payload
        if not transcript and data.get("transcript"):
            t = data["transcript"]
            transcript = t if isinstance(t, list) else []
        if not proctoring_logs and data.get("proctoring_logs"):
            pl = data["proctoring_logs"]
            proctoring_logs = pl if isinstance(pl, list) else []

        # Duration
        raw_start = data.get("started_at")
        if raw_start:
            try:
                started_at = datetime.fromisoformat(raw_start.replace("Z", "+00:00"))
            except Exception:
                started_at = datetime.utcnow()
        else:
            started_at = datetime.utcnow()
        duration_mins = max(1, int((datetime.utcnow() - started_at).total_seconds() / 60))

        # 2. Build resume data
        resume_blob = application.get("parsed_data") or {}
        if isinstance(resume_blob, str):
            try:
                resume_blob = json.loads(resume_blob)
            except Exception:
                resume_blob = {}
        if not isinstance(resume_blob, dict):
            resume_blob = {}

        candidate_name = (
            (resume_blob.get("name") or "").strip()
            or (candidate.get("name") or "").strip()
            or (str(candidate.get("email", "")).split("@")[0] if candidate.get("email") else "")
            or "Candidate"
        )

        # 3. Run AI assessment with termination context
        assessment_data = await assessment_generator.generate_assessment(
            interview_id=interview_id,
            transcript=transcript,
            proctoring_logs=proctoring_logs,
            job_data=job,
            resume_data=resume_blob,
            duration_minutes=duration_mins,
            termination_reason=termination_reason,
        )

        assessment_data["candidate_name"] = candidate_name
        assessment_data["job_title"] = job.get("title", "Unknown Role")
        assessment_data["proctoring_logs_raw"] = proctoring_logs
        assessment_data["transcript_turns"] = len(transcript or [])

        verdict = assessment_data.get("verdict", "no_hire")
        assessment_id = str(uuid.uuid4())

        # 4. Build DB insert row — null scores stored as NULL (not 0)
        insert_row: Dict[str, Any] = {
            "id": assessment_id,
            "interview_id": interview_id,
            "overall_score": assessment_data.get("overall_score") or 0,
            "technical_score": assessment_data.get("technical_score"),   # may be null
            "behavioral_score": assessment_data.get("behavioral_score"), # may be null
            "verdict": verdict,
            "detailed_report": assessment_data,
        }

        OPTIONAL_COLUMNS = {
            "communication_score": assessment_data.get("communication_score"),
            "cultural_fit_score": assessment_data.get("cultural_fit_score"),
            "problem_solving_score": assessment_data.get("problem_solving_score"),
            "expected_salary": assessment_data.get("expected_salary"),
            "negotiated_salary": assessment_data.get("negotiated_salary"),
            "verdict_reasoning": assessment_data.get("verdict_reasoning", ""),
            "key_strengths": assessment_data.get("key_strengths", []),
            "areas_of_improvement": assessment_data.get("areas_of_improvement", []),
            "round_summaries": assessment_data.get("round_summaries", []),
        }

        try:
            supabase.table("assessments").insert({**insert_row, **OPTIONAL_COLUMNS}).execute()
        except Exception as col_err:
            logger.warning(f"Full insert failed ({col_err}); retrying with base columns only.")
            supabase.table("assessments").insert(insert_row).execute()

        # 5. Update interview status
        interview_status = (
            InterviewStatus.CANCELLED.value
            if termination_reason == "tab_guard"
            else InterviewStatus.COMPLETED.value
        )
        try:
            supabase.table("interviews").update(
                {"status": interview_status}
            ).eq("id", interview_id).execute()
        except Exception as e:
            logger.warning(f"Interview status update skipped: {e}")

        # 6. Update application status
        app_id = application.get("id") or data.get("application_id")
        if app_id:
            try:
                # Force status to 'interviewed'
                supabase.table("applications").update(
                    {"status": ApplicationStatus.INTERVIEWED.value}
                ).eq("id", app_id).execute()
                logger.info(f"[Assessment] Updated application {app_id} to status 'interviewed'")
            except Exception as e:
                logger.warning(f"[Assessment] Failed to update application {app_id} status: {e}")

        # 7. Notify recruiter
        recruiter_email = recruiter.get("email")
        if recruiter_email:
            dashboard_link = f"{settings.FRONTEND_URL}/recruiter/assessments/{interview_id}"
            sr = assessment_data.get("security_report") or {}
            shield_line = ""
            if isinstance(sr, dict):
                tl = sr.get("shield_alert_timeline") or []
                if isinstance(tl, list) and tl:
                    shield_line = str(tl[0])[:240]
                else:
                    fv = sr.get("final_security_verdict", "clear")
                    shield_line = f"AI Shield verdict: {fv}"
            await send_assessment_ready(
                to_email=recruiter_email,
                recruiter_name=recruiter.get("full_name") or recruiter.get("name") or "Recruiter",
                candidate_name=candidate_name,
                job_title=job.get("title", "Unknown Role"),
                overall_score=int(assessment_data.get("overall_score") or 0),
                verdict=verdict,
                dashboard_link=dashboard_link,
                technical_score=int(assessment_data["technical_score"]) if assessment_data.get("technical_score") is not None else None,
                behavioral_score=int(assessment_data["behavioral_score"]) if assessment_data.get("behavioral_score") is not None else None,
                communication_score=int(assessment_data["communication_score"]) if assessment_data.get("communication_score") is not None else None,
                cultural_fit_score=int(assessment_data["cultural_fit_score"]) if assessment_data.get("cultural_fit_score") is not None else None,
                problem_solving_score=int(assessment_data["problem_solving_score"]) if assessment_data.get("problem_solving_score") is not None else None,
                security_summary=shield_line or "No critical AI Shield alerts.",
            )

        # 8. Notify candidate
        candidate_email = candidate.get("email")
        if candidate_email:
            candidate_dashboard_link = f"{settings.FRONTEND_URL}/candidate/scorecard/{interview_id}"
            await send_candidate_scorecard_email(
                to_email=candidate_email,
                candidate_name=candidate_name,
                job_title=job.get("title", "Unknown Role"),
                overall_score=int(assessment_data.get("overall_score") or 0),
                scorecard_link=candidate_dashboard_link,
            )

        logger.info(f"[OK] Assessment completed for interview {interview_id} [{termination_reason}]")

    except Exception as e:
        logger.error(f"[FAIL] Background assessment task failed: {e}")
