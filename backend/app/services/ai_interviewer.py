"""
AI Interviewer Service
Orchestrates the OpenAI Realtime API for voice-based interviews.
Manages the state machine: Intro -> Technical -> Behavioral -> Salary
"""
import json
import re
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional
from enum import Enum

from openai import AsyncOpenAI
from app.core.config import settings
from app.core.database import get_redis
import logging
from langfuse import observe

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


class InterviewPhase(str, Enum):
    INTRO = "intro"
    TECHNICAL = "technical"
    BEHAVIORAL = "behavioral"
    SALARY = "salary"
    COMPLETED = "completed"


def _format_phase_template(template: str, **kwargs: Any) -> str:
    """str.format rejects extra kwargs; each phase uses a different subset of fields."""
    names = set(re.findall(r"(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}", template))
    filtered = {k: v for k, v in kwargs.items() if k in names}
    return template.format(**filtered)


PHASE_PROMPTS = {
    InterviewPhase.INTRO: """
You are HireAI, a professional AI interviewer conducting the INTRODUCTION ROUND.

Job Title: {job_title}
Job Description (excerpt): {job_description}

Your goals for this round:
1. Greet the candidate warmly by name — their resume and application are already on file.
2. NEVER ask them to re-upload a resume, email a resume, or verify their phone number.
3. Confirm the role they applied for — tie it to the job title above.
4. Ask 2-3 concise, open-ended questions about their background, career journey, and why they are interested in this specific role.
5. Keep answers grounded — only reference skills, employers, or projects that appear in their resume data. Do NOT guess or invent details.
6. Once you have a clear picture of their background and motivations, smoothly transition to the Technical round by saying "Let's move on to some technical questions."

Tone: Professional, warm, and concise. One question at a time.
""",

    InterviewPhase.TECHNICAL: """
You are HireAI conducting the TECHNICAL ASSESSMENT ROUND.

Role: {job_title}
Job Description (excerpt — BINDING for what to test): {job_description}
Candidate Resume (parsed JSON — AUTHORITATIVE source of truth): {resume_data}
Required Skills from JD: {key_skills}
Job Requirements: {job_requirements}

Your goals:
1. Ask ONLY about technologies, skills, and tools that appear explicitly in BOTH the job description AND the candidate's resume. Never invent topics.
2. Ask 4-6 progressively deeper questions. Start with fundamentals and probe based on their answers.
3. Each follow-up question must be driven by what the candidate ACTUALLY said — not assumptions.
4. If the candidate's answer is vague, ask ONE targeted follow-up to probe depth.
5. If the candidate struggles, acknowledge and move to the next relevant topic — do not dwell.
6. After sufficient coverage, transition: "Great, let's move to some situational questions."

Anti-hallucination rules (CRITICAL — violating these is a failure):
- NEVER ask about React, Node.js, TypeScript, or any frontend framework unless those exact words appear in the job description or resume.
- NEVER invent projects, employers, or skills not present in the resume JSON.
- NEVER ask generic algorithm/whiteboard questions (linked lists, sorting, etc.) unless the JD specifically asks for DSA skills.
- If a topic has no evidence in the JD or resume, SKIP IT.
- Ground every question in actual evidence: quote the resume or JD implicitly.

Question format: One clear, specific question at a time. No compound/multi-part questions.
""",

    InterviewPhase.BEHAVIORAL: """
You are HireAI conducting the BEHAVIOURAL ROUND.

Role: {job_title}
Job Description (excerpt): {job_description}
Candidate Resume (parsed JSON): {resume_data}

Your goals:
1. Ask 3-4 scenario-based STAR method questions (Situation, Task, Action, Result).
2. Tailor every question to THIS candidate — reference their actual past roles, companies, or projects from the resume JSON.
3. Assess: ownership, teamwork, conflict resolution, adaptability, and communication clarity.
4. Follow up on their answers with one specific probe if needed.
5. After sufficient behavioral coverage, transition: "Let's move on to discuss the offer and compensation."

Example question structures to adapt (MUST be tailored to their actual resume — do NOT use these verbatim if not relevant):
- "At [Company from resume], tell me about a time you had to [relevant challenge for this role]..."
- "You mentioned [Project/Skill from resume] — walk me through a difficult decision you made during that work."
- "How have you handled a situation where your team disagreed on a technical approach?"

Rules:
- NEVER use the sample questions above verbatim — always adapt them to the candidate's actual experience.
- NEVER fabricate scenarios or assume experiences not mentioned in the resume.
- One question at a time.
""",

    InterviewPhase.SALARY: """
You are HireAI conducting the OFFER & COMPENSATION DISCUSSION phase.

Role: {job_title}
Company budget for this role: {salary_min} to {salary_max} LPA
Candidate's expected salary (from profile): {expected_salary} LPA

Your goals:
1. Transition smoothly: "We are in the final stage — let's talk about compensation."
2. Ask for the candidate's current/expected CTC if not already stated.
3. Present the company's approved range: {salary_min} to {salary_max} LPA — professionally and transparently.
4. You CANNOT offer above {salary_max} LPA under any circumstances.
5. Discuss other components if needed: joining bonus, ESOPs, variable pay, remote flexibility, learning budget.
6. Reach a documented conclusion: agreement, counter-offer noted, or acknowledged gap.
7. Close the interview warmly: thank them, explain next steps, and end the session professionally.

Rules:
- Be respectful — this is a discussion, not a confrontation.
- Do NOT reveal compensation for other candidates or roles.
- Keep it factual and structured.
""",
}


class InterviewStateMachine:
    """Manages the interview state for a single interview session."""

    def __init__(self, interview_id: str, resume_data: Dict, job_data: Dict):
        self.interview_id = interview_id
        self.resume_data = resume_data
        self.job_data = job_data
        self.current_phase = InterviewPhase.INTRO
        self.transcript: List[Dict] = []
        self.phase_start_times: Dict[str, datetime] = {InterviewPhase.INTRO: datetime.utcnow()}
        self.phase_scores: Dict[str, Optional[float]] = {}
        self.questions_asked: List[str] = []

    def _job_skills_text(self) -> str:
        """Supabase jobs use `requirements` (text[]); some paths use `required_skills`."""
        raw = self.job_data.get("required_skills") or self.job_data.get("requirements") or []
        if not isinstance(raw, (list, tuple)):
            raw = [raw] if raw else []
        cleaned = [str(s).strip() for s in raw if s is not None and str(s).strip()]
        return ", ".join(cleaned) if cleaned else "(derive from job title + description + resume only)"

    def _job_description_excerpt(self, max_chars: int = 3500) -> str:
        desc = self.job_data.get("description") or ""
        if not isinstance(desc, str):
            desc = str(desc)
        desc = desc.strip()
        if not desc:
            return "(No job description text was provided — rely on job title, requirements array, and resume JSON only.)"
        return desc[:max_chars]

    def _session_preamble(self) -> str:
        """Prepended to every phase prompt — enforces English, anti-hallucination, and grounding rules."""
        has_resume = isinstance(self.resume_data, dict) and bool(self.resume_data)
        return f"""
## ABSOLUTE RULES — Apply in every round without exception

### Language
- You MUST conduct this ENTIRE interview in ENGLISH ONLY.
- If the candidate speaks in Hindi, Hinglish, or ANY other language, respond ONLY in English and politely say: "For this interview, I'll need you to respond in English. Please go ahead."
- Never switch to any other language under any circumstance, even if the candidate insists.

### Anti-Hallucination
- You are a structured interviewer, NOT a creative storyteller. Do not invent, assume, or fabricate.
- ALL questions must be grounded in: (a) the job description, (b) the requirements list, OR (c) the candidate's actual resume JSON.
- If a topic has no evidence in any of those three sources, DO NOT ask about it.
- Never assume the candidate knows or has done something not evidenced in the resume.
- Resume on file: {"YES — the resume JSON below is authoritative. Use it." if has_resume else "LIMITED — rely on job posting and their spoken answers only. Ask carefully."}.

### Interview Conduct
- Ask ONE question at a time. Never ask compound or multi-part questions in a single turn.
- Wait for the candidate's answer before asking the next question.
- CRITICAL: If you hear your own voice (echo) or a repetition of what you just said, IGNORE IT. Do not respond to your own output.
- If the audio from the candidate is silent or contains only background noise, stay silent and wait.
- Do not repeat a question you have already asked in this session.
- Do not ask the candidate to verify their phone number or re-upload their resume.
- Do not compliment every answer with "Great!" or "Excellent!" — be professional and neutral.
- Keep each response concise: under 4 sentences unless explaining a technical concept.
- Be direct and structured — this is a professional interview, not a casual chat.
- If you are unsure if the candidate is speaking to you, wait or ask a brief "Could you repeat that?" once.
- DO NOT answer your own questions.
- DO NOT assume the user said something if it sounds like a repetition of your own words.
""".strip()

    def get_system_prompt(self) -> str:
        """Build the system prompt for the current interview phase."""
        template = PHASE_PROMPTS.get(self.current_phase, "")
        smin = int(self.job_data.get("salary_min") or 0)
        smax = int(self.job_data.get("salary_max") or 0)

        fmt_kwargs = dict(
            resume_data=json.dumps(self.resume_data, indent=2),
            job_title=(self.job_data.get("title") or "this role").strip(),
            job_description=self._job_description_excerpt(),
            job_requirements=json.dumps(
                self.job_data.get("requirements", []),
                indent=2,
            ),
            key_skills=self._job_skills_text(),
            salary_min=smin // 100000,
            salary_max=smax // 100000,
            expected_salary=self.resume_data.get("expected_salary", "unknown"),
        )
        body = _format_phase_template(template, **fmt_kwargs)
        return self._session_preamble() + "\n\n" + body


    def advance_phase(self) -> InterviewPhase:
        """Move to the next interview phase."""
        phase_order = [
            InterviewPhase.INTRO,
            InterviewPhase.TECHNICAL,
            InterviewPhase.BEHAVIORAL,
            InterviewPhase.SALARY,
            InterviewPhase.COMPLETED,
        ]
        idx = phase_order.index(self.current_phase)
        if idx < len(phase_order) - 1:
            self.current_phase = phase_order[idx + 1]
            self.phase_start_times[self.current_phase] = datetime.utcnow()
        return self.current_phase

    def add_transcript(self, speaker: str, text: str):
        self.transcript.append({
            "speaker": speaker,
            "text": text,
            "timestamp": datetime.utcnow().isoformat(),
            "phase": self.current_phase,
        })

    def to_dict(self) -> Dict:
        return {
            "interview_id": self.interview_id,
            "current_phase": self.current_phase,
            "transcript": self.transcript,
            "resume_data": self.resume_data,
            "job_data": self.job_data,
            "phase_start_times": {k: v.isoformat() for k, v in self.phase_start_times.items()},
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "InterviewStateMachine":
        instance = cls(
            interview_id=data["interview_id"],
            resume_data=data["resume_data"],
            job_data=data["job_data"],
        )
        instance.current_phase = InterviewPhase(data["current_phase"])
        instance.transcript = data.get("transcript", [])
        return instance


class AIInterviewerService:
    """Core service for AI interview orchestration."""

    async def get_or_create_session(
        self, interview_id: str, resume_data: Dict, job_data: Dict
    ) -> InterviewStateMachine:
        """Retrieve existing session from Redis or create a new one."""
        redis = await get_redis()
        cache_key = f"interview:session:{interview_id}"
        
        cached = None
        if redis:
            try:
                cached = await redis.get(cache_key)
            except Exception as e:
                logger.warning(f"Failed to read from Redis: {e}")
        
        if cached:
            return InterviewStateMachine.from_dict(json.loads(cached))
        
        session = InterviewStateMachine(interview_id, resume_data, job_data)
        await self._save_session(session)
        return session

    async def _save_session(self, session: InterviewStateMachine):
        """Persist session state to Redis."""
        redis = await get_redis()
        if not redis:
            return
            
        cache_key = f"interview:session:{session.interview_id}"
        try:
            await redis.setex(
                cache_key,
                settings.INTERVIEW_ROOM_EXPIRY,
                json.dumps(session.to_dict()),
            )
        except Exception as e:
            logger.warning(f"Failed to write to Redis: {e}")

    @observe()
    async def generate_response(
        self,
        session: InterviewStateMachine,
        candidate_message: str,
        check_phase_transition: bool = True,
    ) -> Dict[str, Any]:
        """Generate AI interviewer response using GPT-4o."""
        
        session.add_transcript("candidate", candidate_message)

        phase_changed = False
        # Check if we should advance to next phase
        if check_phase_transition:
            should_advance = await self._should_advance_phase(session, candidate_message)
            if should_advance:
                session.advance_phase()
                phase_changed = True
                if session.current_phase == InterviewPhase.COMPLETED:
                    await self._save_session(session)
                    return {
                        "text": "Thank you so much for your time today, {name}. It was a pleasure speaking with you. Our team will be in touch shortly with next steps. Have a wonderful day!".format(
                            name=session.resume_data.get("name", "")
                        ),
                        "phase_changed": True,
                        "new_phase": InterviewPhase.COMPLETED,
                        "should_end": True,
                    }

        # Build conversation history for context
        messages = self._build_messages(session)

        try:
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=messages,
                max_tokens=500,
                temperature=0.3,  # Low temperature = grounded, factual, no hallucination
            )
            
            ai_text = response.choices[0].message.content
            session.add_transcript("ai", ai_text)
            await self._save_session(session)

            return {
                "text": ai_text,
                "phase": session.current_phase,
                "phase_changed": phase_changed,
                "new_phase": session.current_phase if phase_changed else None
            }

        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            return {
                "text": "I apologize for the brief interruption. Could you please repeat your last response?",
                "error": str(e),
            }

    def _build_messages(self, session: InterviewStateMachine) -> List[Dict]:
        """Build the message history for the OpenAI API call."""
        messages = [{"role": "system", "content": session.get_system_prompt()}]
        
        # Add last 10 transcript entries for context (avoid token overflow)
        recent = session.transcript[-10:]
        for entry in recent:
            role = "assistant" if entry["speaker"] == "ai" else "user"
            messages.append({"role": role, "content": entry["text"]})
        
        return messages

    @observe()
    async def _should_advance_phase(
        self, session: InterviewStateMachine, latest_message: str
    ) -> bool:
        """Use AI to determine if we should move to the next phase."""
        if session.current_phase == InterviewPhase.COMPLETED:
            return False
        
        phase_transcript = [
            t for t in session.transcript 
            if t.get("phase") == session.current_phase
        ]
        
        # Minimum questions before advancing
        ai_turns = sum(1 for t in phase_transcript if t["speaker"] == "ai")
        
        min_turns = {
            InterviewPhase.INTRO: 2,
            InterviewPhase.TECHNICAL: 4,
            InterviewPhase.BEHAVIORAL: 2,
            InterviewPhase.SALARY: 2,
        }
        
        # TEST MODE: Advance after 60 seconds regardless of turns
        start_time = session.phase_start_times.get(session.current_phase)
        if start_time:
            elapsed = (datetime.utcnow() - start_time).total_seconds()
            if elapsed >= 60:
                logger.info(f"TEST MODE: Advancing phase {session.current_phase} after {elapsed}s")
                return True

        if ai_turns < min_turns.get(session.current_phase, 4):
            return False
        
        # Ask GPT to judge if phase is complete
        check_prompt = f"""
You are evaluating whether the {session.current_phase.value} round of an interview is complete.
Based on the following transcript, should we advance to the next round?
Answer with only "YES" or "NO".

Transcript:
{json.dumps(phase_transcript[-6:], indent=2)}
"""
        try:
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": check_prompt}],
                max_tokens=5,
                temperature=0,
            )
            return "YES" in resp.choices[0].message.content.upper()
        except Exception:
            return False

    async def end_interview(self, session: InterviewStateMachine) -> Dict:
        """End the interview and return the full transcript."""
        session.current_phase = InterviewPhase.COMPLETED
        await self._save_session(session)
        
        return {
            "interview_id": session.interview_id,
            "total_duration_seconds": (
                datetime.utcnow() - 
                datetime.fromisoformat(
                    list(session.phase_start_times.values())[0].isoformat() 
                    if isinstance(list(session.phase_start_times.values())[0], datetime)
                    else list(session.phase_start_times.values())[0]
                )
            ).seconds,
            "transcript": session.transcript,
            "phases_completed": list(session.phase_start_times.keys()),
        }


# Singleton instance
ai_interviewer = AIInterviewerService()
