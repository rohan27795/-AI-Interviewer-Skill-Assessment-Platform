"""
Realtime Speech-to-Speech Interview Proxy
==========================================
WebSocket proxy that bridges the browser ↔ OpenAI Realtime API
(gpt-4o-realtime-preview) for true speech-in, speech-out interviews
with ~300ms latency — no Whisper STT, no separate TTS step.

Architecture:
    Browser --WS--> FastAPI Proxy --WS--> OpenAI Realtime API

Audio format (both directions):
    PCM16, 24 kHz, mono, little-endian  (raw bytes, base64-encoded in JSON)

WebSocket URL:
    ws://localhost:8002/ws/v1/realtime/{interview_id}?token=<jwt>

---
Browser → Proxy message types
-------------------------------
  { "type": "input_audio", "audio": "<base64_pcm16>" }
      Raw 16-bit PCM chunk from the microphone.

  { "type": "end_interview" }
      Candidate clicked "End Session".

  { "type": "ping" }
      Keep-alive.

Proxy → Browser event types (forwarded from OpenAI, plus injected ones)
-------------------------------------------------------------------------
  response.audio.delta          – base64 PCM16 chunk for playback
  response.audio_transcript.delta – partial transcript text
  response.audio_transcript.done  – full turn transcript text
  response.done                 – AI finished speaking
  error                         – forwarded or injected error
  interview_ended               – session complete
  round_change                  – phase transitioned
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import traceback
from datetime import datetime
from typing import Any, Dict, List, Optional

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.core.config import settings
from app.core.database import get_supabase, get_redis
from app.services.ai_interviewer import InterviewStateMachine, InterviewPhase

router = APIRouter()

# OpenAI Realtime WebSocket URL
REALTIME_URL = (
    f"wss://api.openai.com/v1/realtime"
    f"?model={settings.OPENAI_REALTIME_MODEL}"
)

# Headers for OpenAI Realtime API authentication
OPENAI_HEADERS = {
    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
    "OpenAI-Beta": "realtime=v1",
}

# Phase durations (seconds) before auto-advancing
PHASE_MIN_TURNS: Dict[str, int] = {
    "intro":       3,
    "technical":   6,
    "behavioral":  3,
    "salary":      2,
}


class RealtimeInterviewSession:
    """
    Manages one candidate's realtime speech-to-speech interview session.
    Holds references to both WebSockets and tracks transcript/phase state.
    """

    def __init__(self, interview_id: str, browser_ws: WebSocket):
        self.interview_id = interview_id
        self.browser_ws = browser_ws
        self.state_machine: Optional[InterviewStateMachine] = None
        self.transcript: List[Dict[str, Any]] = []
        self.proctoring_logs: List[Dict[str, Any]] = []
        self.current_phase = InterviewPhase.INTRO
        self.started_at = datetime.utcnow()
        self._ai_turn_count: Dict[str, int] = {}   # phase → turns spoken by AI
        self._candidate_turn_count: Dict[str, int] = {} # phase → turns spoken by candidate
        self._partial_ai_text = ""                  # accumulate streaming AI transcript
        self._partial_candidate_text = ""           # accumulate streaming candidate transcript
        self._pending_candidate_item_id: Optional[str] = None  # track in-flight candidate audio item
        # Why the interview ended: "completed" | "early_exit" | "tab_guard"
        self.termination_reason: str = "completed"
        self._assessment_triggered: bool = False     # prevent double-trigger

    # ── Initialization ────────────────────────────────────────────────────────

    async def initialize(self):
        """Load interview data from Supabase and build the state machine."""
        is_test = self.interview_id in {"test", "test-interview"}

        if is_test:
            candidate_name = "Test Candidate"
            job_data = {
                "title": "Senior Frontend Engineer",
                "description": "A great role for a React expert.",
                "requirements": ["React", "TypeScript", "Tailwind"],
                "required_skills": ["React", "TypeScript"],
                "salary_min": 1200000,
                "salary_max": 2000000,
            }
            resume_data = {
                "name": candidate_name,
                "skills": ["React", "TypeScript"],
                "expected_salary": "18",
            }
        else:
            supabase = get_supabase()
            result = supabase.table("interviews").select(
                "*, applications(*, jobs(*), users(*))"
            ).eq("id", self.interview_id).single().execute()

            if not result.data:
                raise ValueError(f"Interview {self.interview_id} not found")

            data = result.data
            application = data["applications"]
            job = application["jobs"]
            candidate = application["users"]

            job_data = dict(job or {})
            req = job_data.get("required_skills") or job_data.get("requirements") or []
            if not isinstance(req, list):
                req = [str(req)] if req else []
            job_data["required_skills"] = [str(x) for x in req if x is not None and str(x).strip()]

            resume_data = application.get("parsed_data") or {}
            if isinstance(resume_data, str):
                try:
                    import json
                    resume_data = json.loads(resume_data)
                except Exception:
                    resume_data = {}
            if not isinstance(resume_data, dict):
                resume_data = {}
            parsed_name = (resume_data.get("name") or "").strip() if isinstance(resume_data, dict) else ""
            email_local = ""
            if candidate and candidate.get("email"):
                email_local = str(candidate["email"]).split("@")[0].replace(".", " ").title()
            candidate_name = parsed_name or (candidate.get("name") if candidate else None) or email_local or "Candidate"
            resume_data.setdefault("name", candidate_name)

            # Mark as in-progress
            supabase.table("interviews").update({
                "status": "in_progress",
            }).eq("id", self.interview_id).execute()

        self.state_machine = InterviewStateMachine(
            interview_id=self.interview_id,
            resume_data=resume_data,
            job_data=job_data,
        )

        # Restore from Redis if reconnecting
        redis = await get_redis()
        if redis:
            cached = await redis.get(f"realtime:session:{self.interview_id}")
            if cached:
                saved = json.loads(cached)
                self.current_phase = InterviewPhase(saved.get("current_phase", "intro"))
                self.transcript = saved.get("transcript", [])
                self.state_machine.current_phase = self.current_phase
                self.state_machine.transcript = self.transcript

    # ── Transcript helpers ────────────────────────────────────────────────────

    def add_transcript(self, speaker: str, text: str):
        if not text.strip():
            return
        turn = {
            "speaker": speaker,
            "text": text.strip(),
            "timestamp": datetime.utcnow().isoformat(),
            "round": self.current_phase.value,
        }
        self.transcript.append(turn)
        if self.state_machine:
            self.state_machine.transcript.append(turn)
        if speaker == "ai":
            phase = self.current_phase.value
            self._ai_turn_count[phase] = self._ai_turn_count.get(phase, 0) + 1
        elif speaker == "candidate":
            phase = self.current_phase.value
            self._candidate_turn_count[phase] = self._candidate_turn_count.get(phase, 0) + 1

    # ── Phase management ──────────────────────────────────────────────────────

    def should_advance_phase(self) -> bool:
        """Decide if the AI has spoken enough to advance to the next phase."""
        if self.current_phase == InterviewPhase.COMPLETED:
            return False
            
        phase = self.current_phase.value
        ai_turns = self._ai_turn_count.get(phase, 0)
        candidate_turns = self._candidate_turn_count.get(phase, 0)
        
        # CRITICAL: Do not advance if the candidate hasn't spoken at all in this phase.
        # This prevents the AI from "interviewing itself" due to echo or noise.
        if candidate_turns == 0 and ai_turns > 0:
            return False
            
        required = PHASE_MIN_TURNS.get(phase, 4)
        if ai_turns >= required:
            return True
            
        # Fast QA mode: still run all rounds, but cap wall-clock per phase
        if settings.INTERVIEW_FAST_TEST and self.state_machine and ai_turns >= 1 and candidate_turns >= 1:
            started = self.state_machine.phase_start_times.get(self.current_phase)
            if started is not None:
                elapsed = (datetime.utcnow() - started).total_seconds()
                floor_s = max(5, int(settings.INTERVIEW_FAST_PHASE_SECONDS))
                if elapsed >= floor_s:
                    return True
        return False

    async def advance_phase(self) -> InterviewPhase:
        """Advance phase on the state machine and notify the browser."""
        if not self.state_machine:
            return self.current_phase
        new_phase = self.state_machine.advance_phase()
        self.current_phase = new_phase
        await self.browser_ws.send_json({
            "type": "round_change",
            "data": {"round": new_phase.value},
        })
        return new_phase

    # ── Session persistence ───────────────────────────────────────────────────

    async def save_state(self):
        redis = await get_redis()
        if not redis:
            return
        await redis.setex(
            f"realtime:session:{self.interview_id}",
            settings.INTERVIEW_ROOM_EXPIRY,
            json.dumps({
                "current_phase": self.current_phase.value,
                "transcript": self.transcript[-50:],
                "started_at": self.started_at.isoformat(),
            }),
        )

    # ── Interview teardown ────────────────────────────────────────────────────

    async def end_interview(self):
        """Persist transcript and trigger assessment generation."""
        # Prevent double-trigger (e.g. disconnect fires after end_interview already called)
        if self._assessment_triggered:
            print(f"[Realtime] Assessment already triggered for {self.interview_id} — skipping.")
            return
        self._assessment_triggered = True

        if self.interview_id in {"test", "test-interview"}:
            print("[Realtime] Skipping DB update for test session.")
            return

        supabase = get_supabase()

        # ── Persist transcript + termination status ──
        db_status = "cancelled" if self.termination_reason == "tab_guard" else "completed"
        update_payload: dict = {
            "status": db_status,
            "transcript": self.transcript,
        }
        try:
            supabase.table("interviews").update(update_payload).eq("id", self.interview_id).execute()
        except Exception as e:
            print(f"[Realtime] DB update error (non-fatal): {e}")

        # Try to persist proctoring_logs separately — column may not exist yet
        if self.proctoring_logs:
            try:
                supabase.table("interviews").update({
                    "proctoring_logs": self.proctoring_logs,
                }).eq("id", self.interview_id).execute()
            except Exception:
                pass  # column not present — logs are passed directly to assessment generator

        # ── Trigger assessment with termination context ──
        try:
            from app.services.assessment_generator import generate_assessment
            asyncio.create_task(
                generate_assessment(
                    self.interview_id,
                    self.transcript,
                    self.proctoring_logs,
                    termination_reason=self.termination_reason,
                )
            )
            print(f"[Realtime] Assessment task queued for {self.interview_id} [{self.termination_reason}]")
        except Exception as e:
            print(f"[Realtime] Failed to queue assessment task: {e}")


# ── Build OpenAI Realtime session config ──────────────────────────────────────

def _build_session_config(state_machine: InterviewStateMachine) -> Dict[str, Any]:
    """
    Build the session.update payload to send to OpenAI on connect.
    This configures voice, audio format, turn detection, and the system prompt.
    """
    system_prompt = state_machine.get_system_prompt()

    return {
        "type": "session.update",
        "session": {
            "modalities": ["audio", "text"],
            "instructions": system_prompt,
            "voice": "alloy",
            "input_audio_format": "pcm16",
            "output_audio_format": "pcm16",
            # IMPORTANT: only 'model' is a valid field here.
            # Adding 'language' or other unknown fields silently breaks Whisper transcription.
            "input_audio_transcription": {
                "model": "whisper-1",
            },
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 700,
            },
            "temperature": 0.4,
            "max_response_output_tokens": 350,
        },
    }


# ── Main WebSocket endpoint ───────────────────────────────────────────────────

@router.websocket("/realtime/{interview_id}")
async def realtime_interview(
    websocket: WebSocket,
    interview_id: str,
    token: str = Query(default="mock"),
):
    """
    True speech-to-speech intervew via OpenAI Realtime API proxy.

    The browser sends raw PCM16 audio chunks; this endpoint proxies them
    to OpenAI which returns streamed PCM16 audio + live transcript events.
    """
    await websocket.accept()
    session = RealtimeInterviewSession(interview_id, websocket)

    def log_error(msg_str: str):
        with open("proxy_debug.log", "a", encoding="utf-8") as f:
            f.write(f"[{datetime.utcnow().isoformat()}] {interview_id}: {msg_str}\n")
            traceback.print_exc(file=f)
            
    try:
        await session.initialize()
    except Exception as e:
        log_error(f"Init failed: {e}")
        await websocket.send_json({"type": "error", "data": {"message": str(e)}})
        await websocket.close()
        return

    # Connect to OpenAI Realtime API
    try:
        openai_ws = await websockets.connect(
            REALTIME_URL,
            additional_headers=OPENAI_HEADERS,
            max_size=10 * 1024 * 1024,  # 10 MB max message
        )
    except Exception as e:
        log_error(f"OpenAI WS connect failed: {e}")
        await websocket.send_json({
            "type": "error",
            "data": {"message": "Cannot connect to AI service. Please try again."},
        })
        await websocket.close()
        return

    print(f"[Realtime] Session {interview_id} — connected to OpenAI Realtime API")

    # Build kickoff details (will be sent after session.updated confirms our config)
    candidate_name = session.state_machine.resume_data.get("name", "Candidate")
    job_title = (session.state_machine.job_data.get("title") or "this role").strip()
    kickoff_instruction = (
        f"The candidate ({candidate_name}) just joined for the interview for: {job_title}. "
        "Speak now as HireAI: greet them by name, briefly confirm you already have their parsed resume and "
        "application on file for this role, and ask one short question about what drew them to the role. "
        "Do not ask them to upload or resend a resume, and do not ask for a phone number for routine verification."
    )

    # Task flags
    interview_ended = False
    _kickoff_sent = False  # ensure kickoff fires exactly once, after session is configured

    async def browser_to_openai():
        """Forward browser audio/control messages to OpenAI."""
        nonlocal interview_ended
        try:
            while True:
                try:
                    raw = await websocket.receive_text()
                except WebSocketDisconnect:
                    break

                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                msg_type = msg.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue

                elif msg_type == "end_interview":
                    interview_ended = True
                    # Determine termination reason
                    end_reason = msg.get("reason", "early_exit")
                    if end_reason == "tab_guard":
                        session.termination_reason = "tab_guard"
                    elif end_reason == "completed":
                        session.termination_reason = "completed"
                    else:
                        session.termination_reason = "early_exit"
                    await session.end_interview()
                    await websocket.send_json({
                        "type": "interview_ended",
                        "data": {
                            "message": "Interview completed. Your assessment report will be ready shortly.",
                            "interview_id": interview_id,
                            "termination_reason": session.termination_reason,
                        },
                    })
                    break

                elif msg_type == "integrity_event":
                    data = msg.get("data", {})
                    if data:
                        data["timestamp"] = data.get("timestamp", datetime.utcnow().isoformat())
                        session.proctoring_logs.append(data)
                        # If this is a tab_switch event, mark as tab_guard termination
                        if data.get("event") == "tab_switch":
                            session.termination_reason = "tab_guard"

                elif msg_type == "input_text":
                    # Candidate typed a message instead of speaking
                    text = msg.get("text", "").strip()
                    if text:
                        # Inject as a conversation item and trigger a response
                        await openai_ws.send(json.dumps({
                            "type": "conversation.item.create",
                            "item": {
                                "type": "message",
                                "role": "user",
                                "content": [{"type": "input_text", "text": text}],
                            },
                        }))
                        await openai_ws.send(json.dumps({"type": "response.create"}))
                        # Also add to local transcript
                        session.add_transcript("candidate", text)

                elif msg_type == "input_audio":
                    # Forward raw PCM16 audio to OpenAI
                    audio_b64 = msg.get("audio", "")
                    if audio_b64:
                        await openai_ws.send(json.dumps({
                            "type": "input_audio_buffer.append",
                            "audio": audio_b64,
                        }))

        except websockets.exceptions.ConnectionClosed as e:
            text = f"browser→openai ConnectionClosed: {e.code} / {e.reason}"
            print(f"[Realtime] {text}")
            log_error(text)
        except Exception as e:
            text = f"browser→openai loop error: {e}"
            print(f"[Realtime] {text}")
            log_error(text)

    async def openai_to_browser():
        """Relay OpenAI events to the browser, with transcript interception."""
        nonlocal interview_ended, _kickoff_sent
        try:
            async for raw_event in openai_ws:
                if interview_ended:
                    break

                try:
                    event = json.loads(raw_event)
                except json.JSONDecodeError:
                    continue

                event_type = event.get("type", "")

                # Log every event except high-frequency audio chunks
                if event_type not in ("response.audio.delta", "response.output_audio.delta"):
                    print(f"[Realtime][{interview_id}] ← {event_type}")
                    log_error(f"EVENT: {event_type} | data: {json.dumps(event)[:300]}")

                # ── Session ready: send our config ─────────────────────────
                if event_type == "session.created":
                    session_config = _build_session_config(session.state_machine)
                    await openai_ws.send(json.dumps(session_config))
                    print(f"[Realtime][{interview_id}] Sent session.update after session.created")

                # ── Config confirmed: send kickoff ─────────────────────────
                elif event_type == "session.updated" and not _kickoff_sent:
                    _kickoff_sent = True
                    print(f"[Realtime][{interview_id}] Session configured — sending kickoff")
                    await openai_ws.send(json.dumps({
                        "type": "conversation.item.create",
                        "item": {
                            "type": "message",
                            "role": "system",
                            "content": [{"type": "input_text", "text": kickoff_instruction}],
                        },
                    }))
                    await openai_ws.send(json.dumps({"type": "response.create"}))

                # ── Forward audio chunks directly ──────────────────────────
                elif event_type in ("response.audio.delta", "response.output_audio.delta"):
                    await websocket.send_json({
                        "type": "response.audio.delta",
                        "delta": event.get("delta") or event.get("audio") or "",
                    })
                    continue

                # ── VAD: candidate started speaking ────────────────────────
                elif event_type == "input_audio_buffer.speech_started":
                    session._partial_candidate_text = ""
                    await websocket.send_json({"type": "speech_started"})

                # ── VAD: candidate stopped speaking ────────────────────────
                elif event_type == "input_audio_buffer.speech_stopped":
                    await websocket.send_json({"type": "speech_stopped"})

                # ── Candidate audio committed (speech turn finalized) ──────
                elif event_type == "input_audio_buffer.committed":
                    item_id = event.get("item_id", "")
                    if item_id:
                        session._pending_candidate_item_id = item_id

                # ── Live candidate transcript delta (streaming) ────────────
                elif event_type == "conversation.item.input_audio_transcription.delta":
                    delta = event.get("delta", "").strip()
                    if delta:
                        session._partial_candidate_text += delta
                        await websocket.send_json({
                            "type": "transcript_update",
                            "data": {"speaker": "candidate", "text": session._partial_candidate_text, "partial": True},
                        })

                # ── Candidate transcript complete (Whisper done) ───────────
                elif event_type == "conversation.item.input_audio_transcription.completed":
                    candidate_text = (event.get("transcript") or session._partial_candidate_text).strip()
                    session._partial_candidate_text = ""
                    session._pending_candidate_item_id = None
                    if candidate_text:
                        print(f"[Realtime][{interview_id}] Candidate said: {candidate_text[:100]}")
                        session.add_transcript("candidate", candidate_text)
                        await websocket.send_json({
                            "type": "transcript_update",
                            "data": {"speaker": "candidate", "text": candidate_text, "partial": False},
                        })
                        await session.save_state()

                # ── Candidate transcript failed (Whisper error) ────────────
                elif event_type == "conversation.item.input_audio_transcription.failed":
                    partial = session._partial_candidate_text.strip()
                    session._partial_candidate_text = ""
                    session._pending_candidate_item_id = None
                    error_msg = event.get("error", {}).get("message", "unknown")
                    print(f"[Realtime][{interview_id}] Transcription FAILED: {error_msg}")
                    if partial:
                        session.add_transcript("candidate", partial)
                        await websocket.send_json({
                            "type": "transcript_update",
                            "data": {"speaker": "candidate", "text": partial, "partial": False},
                        })

                # ── AI transcript streaming ────────────────────────────────
                elif event_type in (
                    "response.audio_transcript.delta",
                    "response.output_audio_transcript.delta",
                ):
                    delta = event.get("delta", "")
                    session._partial_ai_text += delta
                    await websocket.send_json({"type": "response.audio_transcript.delta", "delta": delta})
                    continue

                # ── AI transcript complete ─────────────────────────────────
                elif event_type in (
                    "response.audio_transcript.done",
                    "response.output_audio_transcript.done",
                ):
                    full_text = event.get("transcript") or event.get("text") or session._partial_ai_text
                    session._partial_ai_text = ""
                    if full_text:
                        print(f"[Realtime][{interview_id}] AI said: {full_text[:100]}")
                        session.add_transcript("ai", full_text)
                        await websocket.send_json({
                            "type": "transcript_update",
                            "data": {"speaker": "ai", "text": full_text},
                        })

                        if session.should_advance_phase():
                            new_phase = await session.advance_phase()
                            if new_phase == InterviewPhase.COMPLETED:
                                interview_ended = True
                                await session.end_interview()
                                await websocket.send_json({
                                    "type": "interview_ended",
                                    "data": {"message": "Interview completed. Your assessment report will be ready shortly.", "interview_id": interview_id},
                                })
                                break
                            else:
                                new_config = _build_session_config(session.state_machine)
                                await openai_ws.send(json.dumps(new_config))

                        await session.save_state()

                # ── AI response done ───────────────────────────────────────
                elif event_type == "response.done":
                    await websocket.send_json({"type": "response.done"})

                # ── Error from OpenAI ──────────────────────────────────────
                elif event_type == "error":
                    err_msg = event.get("error", {}).get("message", str(event))
                    print(f"[Realtime][{interview_id}] OpenAI ERROR: {err_msg}")
                    log_error(f"OpenAI error event: {err_msg}")
                    await websocket.send_json({"type": "error", "data": {"message": err_msg}})

                # ── Forward everything else transparently ──────────────────
                else:
                    try:
                        await websocket.send_json(event)
                    except Exception:
                        pass

        except websockets.exceptions.ConnectionClosed as e:
            text = f"openai→browser ConnectionClosed: {e.code} / {e.reason}"
            print(f"[Realtime] {text}")
            log_error(text)
        except Exception as e:
            text = f"openai→browser loop error: {e}"
            print(f"[Realtime] {text}")
            log_error(text)

    # Run both relay coroutines concurrently
    try:
        await asyncio.gather(
            browser_to_openai(),
            openai_to_browser(),
        )
    finally:
        await session.save_state()
        # If the browser disconnected without sending end_interview (e.g. crashed, F5),
        # still generate an assessment so the recruiter sees something.
        if not session._assessment_triggered and session.interview_id not in {"test", "test-interview"}:
            print(f"[Realtime] Session {interview_id} closed without end_interview — triggering assessment [{session.termination_reason}]")
            # Treat abrupt disconnects as early_exit unless tab_guard was already set
            if session.termination_reason == "completed":
                session.termination_reason = "early_exit"
            await asyncio.shield(session.end_interview())
        try:
            await openai_ws.close()
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
        print(f"[Realtime] Session {interview_id} closed.")
