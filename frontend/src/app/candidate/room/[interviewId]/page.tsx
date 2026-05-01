'use client'

import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import Link from 'next/link'
import Image from 'next/image'
import {
  Video, VideoOff, Mic, MicOff, Settings,
  MessageSquare, Users, Shield, Send, Sparkles,
  Loader2, CheckCircle, AlertCircle, Play, Pause,
  Volume2, VolumeX, Mic as LucideMic, Brain, Calendar, Clock, ArrowRight, Wifi, MapPin,
  ChevronRight, PhoneOff
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useProctoring } from '@/hooks/useProctoring'
import { useTabGuard } from '@/hooks/useTabGuard'
import { getApiUrl } from '@/lib/api'

type InterviewRound = 'intro' | 'technical' | 'behavioral' | 'salary'

const rounds: { id: InterviewRound; label: string; color: string; icon: string }[] = [
  { id: 'intro', label: 'Introduction', color: '#6366f1', icon: '👋' },
  { id: 'technical', label: 'Technical', color: '#a855f7', icon: '💻' },
  { id: 'behavioral', label: 'Behavioural', color: '#f59e0b', icon: '🧠' },
  { id: 'salary', label: 'Salary', color: '#22c55e', icon: '💰' },
]

function VoiceBars({ active, color = '#818cf8', size = 'md' }: { active: boolean; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const heights = size === 'lg' ? [12, 20, 28, 20, 12] : size === 'sm' ? [6, 10, 14, 10, 6] : [8, 14, 20, 14, 8]
  return (
    <div className={`flex items-end gap-[3px] transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-20'}`}>
      {heights.map((h, i) => (
        <div key={i}
          className={`w-[3px] rounded-full ${active ? 'voice-bar' : ''}`}
          style={{
            height: active ? `${h}px` : '3px',
            animationDelay: `${i * 0.12}s`,
            background: color,
            transition: 'height 0.3s ease',
          }} />
      ))}
    </div>
  )
}

function ScoreRing({ score, label, color, size = 72 }: { score: number; label: string; color: string; size?: number }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90 absolute inset-0" width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="6"
            strokeLinecap="round" strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 6px ${color}60)` }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-black text-white">{score}</span>
        </div>
      </div>
      <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest">{label}</span>
    </div>
  )
}

function PulseRing({ active, color }: { active: boolean; color: string }) {
  if (!active) return null
  return (
    <>
      <div className="absolute -inset-3 rounded-full animate-ping opacity-20" style={{ background: color, animationDuration: '1.5s' }} />
      <div className="absolute -inset-6 rounded-full animate-ping opacity-10" style={{ background: color, animationDuration: '1.5s', animationDelay: '0.3s' }} />
    </>
  )
}

export default function InterviewRoom({ params }: { params: { interviewId: string } }) {
  const [hasStarted, setHasStarted] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [currentRound, setCurrentRound] = useState<InterviewRound>('intro')
  const [elapsed, setElapsed] = useState(0)
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [candidateSpeaking, setCandidateSpeaking] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [scores, setScores] = useState({ technical: 0, communication: 0, confidence: 0 })
  const [transcript, setTranscript] = useState<{ speaker: string; text: string; partial?: boolean }[]>([])
  const [activePanel, setActivePanel] = useState<'transcript' | 'insights' | null>('transcript')
  const [showRoundTransition, setShowRoundTransition] = useState(false)

  const aiSpeakingRef = useRef(false)
  const prevRoundRef = useRef<InterviewRound>('intro')
  // Buffer the next round — only display it once AI starts speaking (first audio chunk)
  const pendingRoundRef = useRef<InterviewRound | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const proctorStatus = useProctoring(videoRef, hasStarted && camOn)
  const tabStatus = useTabGuard(hasStarted)

  // ── Realtime API refs ────────────────────────────────────────
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const speakerOnRef = useRef(true)
  const micOnRef = useRef(true)
  // PCM16 playback state (Realtime API sends PCM16 at 24kHz)
  const scheduledTimeRef = useRef(0)        // next audio chunk schedule time

  // Track active audio sources so we can stop them on barge-in
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])

  // ── PCM16 playback via AudioContext (OpenAI Realtime sends PCM16 at 24kHz) ──
  const playPCM16Chunk = (base64Pcm: string) => {
    const ctx = audioContextRef.current
    if (!ctx || !speakerOnRef.current) return

    // Fast Base64 → Uint8Array
    const binaryString = atob(base64Pcm)
    const len = binaryString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Uint8Array → Int16Array
    const int16 = new Int16Array(bytes.buffer)

    // Convert Int16 → Float32 [-1, 1]
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0
    }

    const sampleRate = 24000
    const buffer = ctx.createBuffer(1, float32.length, sampleRate)
    buffer.copyToChannel(float32, 0)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    const now = ctx.currentTime
    const startAt = Math.max(now, scheduledTimeRef.current)
    source.start(startAt)
    scheduledTimeRef.current = startAt + buffer.duration

    // Track this source for barge-in cancellation
    activeSourcesRef.current.push(source)

    // Mark AI as speaking
    setAiSpeaking(true)
    aiSpeakingRef.current = true

    // If a round change was buffered, apply it now — the AI is about to ask the first
    // question of the new round, so the header should update at this exact moment.
    if (pendingRoundRef.current !== null) {
      setCurrentRound(pendingRoundRef.current)
      pendingRoundRef.current = null
    }

    source.onended = () => {
      // Remove from active sources
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source)
      // Only clear speaking state when all scheduled audio has played
      if (activeSourcesRef.current.length === 0) {
        setAiSpeaking(false)
        aiSpeakingRef.current = false
      }
    }
  }

  // ── WebSocket init — connects to /ws/v1/realtime/{id} ─────────────────────
  const initSocket = async () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return socketRef.current

    const apiUrl = getApiUrl()
    const protocol = apiUrl.startsWith('https') ? 'wss:' : 'ws:'
    const host = apiUrl.replace(/^https?:\/\//, '')
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('hireai_token') || localStorage.getItem('sb-access-token') || 'mock')
      : 'mock'
    const interviewId = params.interviewId || 'test'

    console.log(`[Realtime] Connecting to ${protocol}//${host}/ws/v1/realtime/${interviewId}`)
    const socket = new WebSocket(
      `${protocol}//${host}/ws/v1/realtime/${interviewId}?token=${token}`
    )
    socketRef.current = socket

    return new Promise<WebSocket>((resolve, reject) => {
      socket.onopen = () => {
        console.log('[Realtime] WebSocket connected')
        resolve(socket)
      }

      socket.onmessage = (event) => {
        let msg: any
        try { msg = JSON.parse(event.data) } catch { return }

        const t = msg.type

        if (t === 'response.audio.delta' || t === 'response.output_audio.delta') {
          // Stream PCM16 audio chunk to speakers (both beta and GA event names)
          const chunk = msg.delta || msg.audio
          if (chunk) playPCM16Chunk(chunk)

        } else if (t === 'response.done') {
          // AI finished speaking — clear state once buffered audio drains
          const remaining = Math.max(0, (scheduledTimeRef.current - (audioContextRef.current?.currentTime ?? 0)) * 1000)
          if (remaining <= 50) {
            // No audio buffered, clear immediately
            setAiSpeaking(false)
            aiSpeakingRef.current = false
          } else {
            setTimeout(() => {
              setAiSpeaking(false)
              aiSpeakingRef.current = false
            }, remaining + 100)
          }

        } else if (t === 'speech_started') {
          // VAD detected candidate started speaking — STOP AI audio immediately
          // This is critical for two reasons:
          // 1. Natural barge-in: the AI should stop talking when the candidate speaks
          // 2. Clean mic capture: AI audio from speakers would echo into the mic,
          //    corrupting the candidate's audio and causing Whisper transcription to fail
          setCandidateSpeaking(true)
          // Stop all queued AI audio playback
          activeSourcesRef.current.forEach(s => { try { s.stop() } catch {} })
          activeSourcesRef.current = []
          if (audioContextRef.current) {
            scheduledTimeRef.current = audioContextRef.current.currentTime
          }
          setAiSpeaking(false)
          aiSpeakingRef.current = false

        } else if (t === 'speech_stopped') {
          // VAD detected candidate stopped — keep indicator until transcript arrives

        } else if (t === 'transcript_update') {
          const { speaker, text, partial } = msg.data
          if (partial) {
            // Live partial update — update the last candidate message in-place or add new
            setTranscript(prev => {
              const last = prev[prev.length - 1]
              if (last?.speaker === speaker && last?.partial) {
                // Update last partial message in-place
                return [...prev.slice(0, -1), { speaker, text, partial: true }]
              }
              return [...prev, { speaker, text, partial: true }]
            })
            if (speaker === 'candidate') setCandidateSpeaking(true)
          } else {
            // Final message — replace any trailing partial with the final version
            setTranscript(prev => {
              const last = prev[prev.length - 1]
              if (last?.speaker === speaker && last?.partial) {
                // Replace partial with final
                return [...prev.slice(0, -1), { speaker, text, partial: false }]
              }
              // Guard against exact duplicates
              if (last?.speaker === speaker && last?.text === text) return prev
              return [...prev, { speaker, text, partial: false }]
            })
            if (speaker === 'candidate') setCandidateSpeaking(false)
          }

        } else if (t === 'response.audio_transcript.delta') {
          // Show live partial AI transcript while audio streams
          // (accumulated on the backend and sent as transcript_update when done)

        } else if (t === 'round_change') {
          // Don't update the UI immediately — buffer until the AI starts speaking
          // so the header indicator matches when the question is actually asked.
          pendingRoundRef.current = msg.data.round as InterviewRound

        } else if (t === 'scores_update') {
          setScores(prev => ({ ...prev, ...msg.data }))

        } else if (t === 'interview_ended') {
          // Redirect to candidate-facing scorecard (interviewId from route params)
          window.location.href = `/candidate/scorecard/${params.interviewId}`

        } else if (t === 'error') {
          console.error('[Realtime] Server error:', msg.data?.message)
        }
      }

      socket.onerror = (err) => {
        console.error('[Realtime] WebSocket error', err)
        reject(err)
      }
      socket.onclose = () => console.log('[Realtime] WebSocket closed')
    })
  }

  // ── Start interview — init AudioContext + WebSocket + Mic ─────────────────
  const startInterview = async () => {
    // Use the browser's native rate; the PCM worklet resamples to 24 kHz for OpenAI.
    // Forcing sampleRate: 24000 is ignored by most browsers and causes AudioWorklet errors.
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }
    scheduledTimeRef.current = audioContextRef.current.currentTime
    setHasStarted(true)
    await initSocket()
    await startMicRecording()
  }

  // ── Mic capture using AudioWorklet (PCM16 at 24kHz) ──────────────────────
  const startMicRecording = async () => {
    try {
      // Disconnect previous worklet if any
      workletNodeRef.current?.disconnect()
      workletNodeRef.current?.port.close()
      micStreamRef.current?.getTracks().forEach(t => t.stop())

      const ctx = audioContextRef.current!

      // Load the PCM worklet processor with a cache-buster (served from /public)
      await ctx.audioWorklet.addModule(`/pcm-processor.js?t=${Date.now()}`)

      // Request mic at device-native rate (sampleRate hint is ignored by most browsers)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      micStreamRef.current = stream

      const sourceNode = ctx.createMediaStreamSource(stream)
      // Tell the worklet the actual context rate so it can resample to 24 kHz for OpenAI
      const workletNode = new AudioWorkletNode(ctx, 'pcm-processor', {
        processorOptions: { inputSampleRate: ctx.sampleRate, outputRate: 24000 },
      })
      workletNodeRef.current = workletNode

      // Receive PCM chunks from worklet and send over WebSocket
      workletNode.port.onmessage = (e) => {
        if (!micOnRef.current) return  // user explicitly muted mic
        
        // NOTE: We rely on the browser's built-in echoCancellation (enabled in
        // getUserMedia constraints) to prevent the AI from hearing itself.
        // Previously, all mic audio was dropped while aiSpeakingRef was true,
        // which caused the candidate's transcript to be empty. The browser's
        // AEC handles echo suppression at the hardware level, and OpenAI's
        // server-side VAD handles turn detection, so we always send audio.

        const ws = socketRef.current
        if (ws?.readyState === WebSocket.OPEN) {
          // e.data.audio is an ArrayBuffer containing Int16 PCM
          const bytes = new Uint8Array(e.data.audio);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Audio = btoa(binary);
          ws.send(JSON.stringify({ type: 'input_audio', audio: base64Audio }))
        }
      }

      sourceNode.connect(workletNode)
      // Do NOT connect workletNode to destination (we don't want mic echo)

      setMicOn(true)
      micOnRef.current = true
      console.log(`[Realtime] Mic started (ctx=${ctx.sampleRate}Hz → 24000Hz for OpenAI)`)
    } catch (err) {
      console.error('[Realtime] Failed to start microphone:', err)
      setMicOn(false)
      micOnRef.current = false
    }
  }

  /** Stop AI speech and clear scheduled audio */
  const stopAISpeech = () => {
    // Stop all actively playing audio sources
    activeSourcesRef.current.forEach(s => { try { s.stop() } catch {} })
    activeSourcesRef.current = []
    if (audioContextRef.current) {
      scheduledTimeRef.current = audioContextRef.current.currentTime
    }
    setAiSpeaking(false)
    aiSpeakingRef.current = false
  }

  /** Handle mic button click */
  const handleMicToggle = () => {
    if (micOn) {
      workletNodeRef.current?.disconnect()
      micStreamRef.current?.getTracks().forEach(t => t.stop())
      setMicOn(false)
      micOnRef.current = false
    } else {
      if (aiSpeakingRef.current) stopAISpeech()
      startMicRecording()
    }
  }

  // Silence the AudioWorklet when mic is toggled off (mute gate only, no restart needed)
  // mic is fully stopped via handleMicToggle above

  // Keep speakerOnRef in sync with speakerOn state
  useEffect(() => { speakerOnRef.current = speakerOn }, [speakerOn])

  useEffect(() => {
    return () => {
      socketRef.current?.close()
      audioContextRef.current?.close()
      workletNodeRef.current?.disconnect()
      micStreamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // Handle Round Transitions
  useEffect(() => {
    if (prevRoundRef.current !== currentRound) {
      setShowRoundTransition(true)
      const timer = setTimeout(() => setShowRoundTransition(false), 3000)
      prevRoundRef.current = currentRound
      return () => clearTimeout(timer)
    }
  }, [currentRound])

  useEffect(() => {
    const timer = setInterval(() => {
      if (hasStarted) {
        setElapsed(e => {
          const next = e + 1
          // TEST MODE: Force round transition notification every 60s
          if (next > 0 && next % 60 === 0) {
            console.log("TEST MODE: Round transition trigger at 60s");
          }
          return next
        })
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [hasStarted])

  useEffect(() => {
    if (camOn && videoRef.current) {
      console.log("Interview Room: Requesting Camera access...");
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
          console.log("Interview Room: Camera Stream connected.");
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.error("Camera Autoplay failed:", e));
          }
        })
        .catch(err => {
          console.error("Interview Room: Camera access DENIED or FAILED", err);
        })
    }
  }, [camOn])

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [transcript, aiSpeaking])

  // Send a WebSocket integrity event on each new tab switch
  useEffect(() => {
    if (!hasStarted || tabStatus.switchCount === 0) return
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'integrity_event',
        data: {
          event: 'tab_switch',
          count: tabStatus.switchCount,
          severity: tabStatus.severity,
          timestamp: tabStatus.lastSwitchAt?.toISOString() ?? new Date().toISOString(),
        },
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabStatus.switchCount])

  // Send a WebSocket integrity event when Proctoring (Camera) detects issues
  useEffect(() => {
    if (!hasStarted || !proctorStatus.isWarning) return
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'integrity_event',
        data: {
          event: 'proctoring_alert',
          message: proctorStatus.message,
          faces: proctorStatus.facesDetected,
          severity: 'high',
          timestamp: new Date().toISOString(),
        },
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proctorStatus.isWarning, proctorStatus.message])

  // Auto-terminate the session on Strike 3
  useEffect(() => {
    if (tabStatus.severity !== 'terminated') return
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      // Send 'tab_guard' so backend generates a disqualification scorecard
      socketRef.current.send(JSON.stringify({
        type: 'end_interview',
        reason: 'tab_guard',
        data: { tab_switches: tabStatus.switchCount },
      }))
    }
    const timer = setTimeout(() => { window.location.href = `/candidate/scorecard/${params.interviewId}` }, 3000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabStatus.severity])

  const testVoice = async () => {
    // In Realtime mode the AI speaks as soon as the session starts — no separate test needed
    console.log('[Realtime] Voice test: AI will respond as soon as you speak.')
  }
  const endInterview = () => {
    setIsEnding(true)
    sessionStorage.setItem('last_interview_id', params.interviewId || '')

    // Determine if the interview was fully completed (all 4 rounds done)
    // or ended early by the candidate clicking "End Session"
    const allRoundsDone = currentRound === 'salary' && currentRoundIndex >= rounds.length - 1
    const terminationReason = allRoundsDone ? 'completed' : 'early_exit'

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'end_interview', reason: terminationReason }))
      setTimeout(() => { window.location.href = `/candidate/scorecard/${params.interviewId}` }, 1500)
    } else {
      window.location.href = `/candidate/scorecard/${params.interviewId}`
    }
  }

  const handleSendText = () => {
    if (!inputText.trim() || isSending) return
    setIsSending(true)
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      // Send as text message to the Realtime proxy
      socketRef.current.send(JSON.stringify({
        type: 'input_text',
        text: inputText,
      }))
      setTranscript(prev => [...prev, { speaker: 'candidate', text: inputText }])
      setInputText('')
      setTimeout(() => setIsSending(false), 500)
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  const currentRoundIndex = rounds.findIndex(r => r.id === currentRound)
  const currentRoundData = rounds.find(r => r.id === currentRound)!

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden font-sans" style={{ background: '#0a0c10' }}>

      {/* ── Tab Switch Warning Banner (Strike 1 & 2) ── */}
      <AnimatePresence>
        {(tabStatus.severity === 'warning' || tabStatus.severity === 'critical') && (
          <motion.div
            key="tab-warning-banner"
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed top-0 left-0 right-0 z-[150] flex items-center gap-4 px-6 py-3.5"
            style={{
              background: tabStatus.severity === 'critical'
                ? 'linear-gradient(135deg, rgba(220,38,38,0.97), rgba(185,28,28,0.97))'
                : 'linear-gradient(135deg, rgba(202,138,4,0.97), rgba(234,88,12,0.97))',
              borderBottom: `1px solid ${tabStatus.severity === 'critical' ? 'rgba(239,68,68,0.4)' : 'rgba(251,191,36,0.3)'}`,
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center animate-pulse shrink-0">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-[10px] font-black text-white/80 uppercase tracking-[0.2em]">
                {tabStatus.severity === 'critical' ? '⚠️ Final Warning — Strike 2 of 3' : '⚠️ Integrity Alert — Strike 1 of 3'}
              </span>
              <span className="text-sm font-bold text-white">
                {tabStatus.severity === 'critical'
                  ? 'Tab switch detected. One more violation will terminate your interview.'
                  : 'Tab switch detected. This session is monitored — stay on this page.'}
              </span>
            </div>
            <div className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider border shrink-0 ${tabStatus.isHidden
              ? 'bg-white/20 text-white border-white/30'
              : 'bg-green-500/30 text-green-300 border-green-500/30'
              }`}>
              {tabStatus.isHidden ? 'AWAY' : 'RETURNED'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Interview Terminated Overlay (Strike 3) ── */}
      <AnimatePresence>
        {tabStatus.severity === 'terminated' && (
          <motion.div
            key="tab-terminated-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-8"
            style={{ background: 'rgba(5,0,0,0.97)', backdropFilter: 'blur(30px)' }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 20 }}
              className="flex flex-col items-center text-center max-w-md"
            >
              <div className="w-24 h-24 bg-red-600/20 border-2 border-red-500/30 rounded-full flex items-center justify-center mb-8 shadow-2xl shadow-red-600/30">
                <Shield className="w-12 h-12 text-red-500" />
              </div>
              <h2 className="text-4xl font-black text-white mb-4 tracking-tight">Interview Terminated</h2>
              <p className="text-white/50 text-base leading-relaxed mb-8">
                Your session was terminated due to{' '}
                <span className="text-red-400 font-bold">
                  {tabStatus.switchCount} tab-switching violation{tabStatus.switchCount !== 1 ? 's' : ''}
                </span>
                . This activity has been recorded and flagged for recruiter review.
              </p>
              <div className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500/30 rounded-xl">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-red-400 font-bold">Ending session automatically...</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Start Overlay ── */}
      <AnimatePresence>
        {!hasStarted && (
          <motion.div
            initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 backdrop-blur-2xl"
            style={{ background: '#0a0c10' }}
          >
            <div className="w-24 h-24 mb-8 relative">
              <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
              <div className="relative w-full h-full rounded-full bg-brand-600 flex items-center justify-center shadow-2xl shadow-brand-500/40">
                <Brain className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-black text-white mb-3 tracking-tight">Ready for your Interview?</h1>
            <p className="text-white/50 text-center max-w-sm mb-10 leading-relaxed">
              When you click start, we'll initialize your AI interviewer and secure your voice connection. Please find a quiet place.
            </p>
            {/* AI Shield Monitoring Disclosure */}
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4 max-w-sm text-left mb-8">
              <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/80 leading-relaxed font-medium">
                <span className="font-black text-amber-300">AI Shield Active</span> — This session monitors face presence, gaze direction, and tab switching. Leaving this tab will be flagged and may auto-terminate your interview.
              </p>
            </div>
            <button
              onClick={startInterview}
              className="group flex items-center gap-3 bg-brand-600 hover:bg-brand-700 text-white font-bold px-10 py-5 rounded-2xl transition-all shadow-xl shadow-brand-600/30 hover:scale-105 active:scale-95"
            >
              <Play className="w-5 h-5 fill-white" />
              Join Interview Room
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <header className="h-[68px] shrink-0 flex items-center px-6 gap-4 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(13,15,22,0.95)', backdropFilter: 'blur(20px)' }}>

        {/* Logo */}
        <div className="flex items-center gap-3.5 mr-6">
          <Image src="/hireai-logo.png" alt="HireAI Logo" width={44} height={44} className="rounded-xl shadow-xl object-cover logo-glow" />
          <div>
            <div className="text-white font-black text-lg leading-none tracking-tight">HireAI</div>
            <div className="text-white/30 text-[10px] leading-none mt-1.5 uppercase font-bold tracking-[0.2em]">Interviewer</div>
          </div>
        </div>

        <div className="w-px h-8 mx-2" style={{ background: 'rgba(255,255,255,0.08)' }} />

        {/* Round Progress */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {rounds.map((r, i) => {
              const isCurrent = r.id === currentRound
              const isPast = i < currentRoundIndex
              return (
                <div key={r.id} className="flex items-center">
                  <div className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-[11px] font-black transition-all duration-500 uppercase tracking-widest ${isCurrent ? 'text-white' : isPast ? 'text-white/60' : 'text-white/20'
                    }`}
                    style={isCurrent ? {
                      background: r.color,
                      boxShadow: `0 0 30px ${r.color}40, inset 0 0 10px rgba(255,255,255,0.2)`,
                    } : {}}>
                    {isCurrent && <span className="animate-pulse">{r.icon}</span>}
                    {r.label}
                  </div>
                  {i < rounds.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 mx-1 opacity-10 text-white" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Status + Time */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-emerald-400">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]" />
            LIVE
          </div>
          <div className="text-white/70 text-sm font-mono font-bold bg-white/5 px-4 py-2 rounded-xl border border-white/10">
            {formatTime(elapsed)}
          </div>
        </div>
      </header>

      {/* ── Main Area ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Video + Controls ── */}
        <div className="flex-1 flex flex-col p-5 gap-5 min-w-0">

          <div className="flex-1 grid grid-cols-2 gap-5 min-h-0">
            {/* AI Panel */}
            <div className="relative rounded-3xl overflow-hidden flex flex-col items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #0d1117 0%, #131820 100%)', border: '1px solid rgba(99,102,241,0.2)', boxShadow: `0 0 40px rgba(99,102,241,0.08)` }}>
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest backdrop-blur-xl"
                style={{ background: 'rgba(13,15,22,0.8)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                <Brain className="w-3.5 h-3.5" /> HireAI
              </div>

              <div className="relative z-10 flex flex-col items-center gap-8">
                <div className="relative">
                  <PulseRing active={aiSpeaking} color="#6366f1" />
                  <div className={`relative w-48 h-48 rounded-full overflow-hidden transition-all duration-700 ${aiSpeaking ? 'ring-4 ring-brand-500 ring-offset-8 ring-offset-transparent shadow-2xl scale-105' : 'ring-1 ring-white/10 shadow-sm'}`}>
                    <Image src="/avatars/hireai-avatar.png" alt="HireAI" fill className="object-cover" priority />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <VoiceBars active={aiSpeaking} color="#6366f1" size="lg" />
                  <span className="text-[10px] font-black uppercase tracking-[.25em] text-white/30">
                    {aiSpeaking ? 'AI is Speaking' : 'Listening...'}
                  </span>
                </div>
              </div>
            </div>

            {/* Camera Panel */}
            <div className="relative rounded-3xl overflow-hidden transition-all duration-500"
              style={{ background: '#111317', border: candidateSpeaking && !aiSpeaking ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(16,185,129,0.15)', boxShadow: candidateSpeaking && !aiSpeaking ? '0 0 30px rgba(16,185,129,0.15)' : 'none' }}>
              {camOn ? (
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover grayscale-[0.2]" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-surface-900">
                  <VideoOff className="w-12 h-12 text-white/10" />
                  <span className="text-xs text-white/20 font-bold uppercase tracking-widest">Camera Off</span>
                </div>
              )}
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide backdrop-blur-xl whitespace-nowrap"
                style={{ background: candidateSpeaking && !aiSpeaking ? 'rgba(5,40,20,0.9)' : 'rgba(13,15,22,0.8)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', transition: 'background 0.3s' }}>
                <Mic className={`w-3.5 h-3.5 shrink-0 ${candidateSpeaking && !aiSpeaking ? 'text-emerald-400' : ''}`} />
                <span className="leading-tight text-left">
                  {candidateSpeaking && !aiSpeaking ? <>Speaking<br /><span className="text-emerald-300 font-black">●</span></> : <>Your<br />video</>}
                </span>
              </div>

              {/* Industrial Integrity Shield UI [UPGRADED] */}
              <AnimatePresence>
                {proctorStatus.isWarning && (
                  <motion.div
                    initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                    className="absolute top-0 left-0 right-0 z-[40] flex items-center justify-center p-4"
                  >
                    <div className="bg-red-600/90 backdrop-blur-xl border border-red-400/50 px-6 py-3 rounded-2xl flex items-center gap-4 shadow-2xl shadow-red-600/40">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                        <AlertCircle className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-white uppercase tracking-widest">Security Protocol Breached</span>
                        <span className="text-lg font-black text-white">{proctorStatus.message.split(': ')[1] || proctorStatus.message}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Status Aura Glow */}
              <div className={`absolute inset-0 z-10 transition-all duration-1000 pointer-events-none ${proctorStatus.isWarning ? 'ring-[20px] ring-inset ring-red-600/20' : 'ring-[10px] ring-inset ring-emerald-500/10'
                }`} />

              <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide backdrop-blur-xl transition-colors duration-500 whitespace-nowrap max-w-[46%] sm:max-w-none"
                style={{
                  background: proctorStatus.isWarning ? 'rgba(220,38,38,0.8)' : 'rgba(13,15,22,0.8)',
                  border: `1px solid ${proctorStatus.isWarning ? 'rgba(255,255,255,0.4)' : 'rgba(16,185,129,0.3)'}`,
                  color: proctorStatus.isWarning ? 'white' : '#6ee7b7'
                }}>
                <Shield className={`w-3.5 h-3.5 shrink-0 ${proctorStatus.isWarning ? 'animate-spin' : ''}`} />
                <span className="leading-tight text-right">
                  {proctorStatus.isWarning ? <>HireAI<br />shield · alert</> : <>HireAI<br />shield · on</>}
                </span>
              </div>

              <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-semibold tracking-wide backdrop-blur-xl text-white/50 max-w-[11rem] leading-tight"
                style={{ background: 'rgba(13,15,22,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                Proctoring: {proctorStatus.facesDetected} face{proctorStatus.facesDetected === 1 ? '' : 's'} detected
              </div>
            </div>
          </div>

          {/* ── Controls Dock ── */}
          <div className="shrink-0 flex items-center justify-center gap-5">
            <div className="flex items-center gap-4 px-8 py-4 rounded-3xl backdrop-blur-3xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <button onClick={handleMicToggle} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${micOn ? 'bg-white/5 text-white' : 'bg-red-500/20 text-red-500'}`}>
                {micOn ? <Mic /> : <MicOff />}
              </button>
              <button onClick={() => setCamOn(!camOn)} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${camOn ? 'bg-white/5 text-white' : 'bg-red-500/20 text-red-500'}`}>
                {camOn ? <Video /> : <VideoOff />}
              </button>
              <button onClick={() => setSpeakerOn(!speakerOn)} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all bg-white/5 text-white`}>
                {speakerOn ? <Volume2 /> : <VolumeX />}
              </button>
              <div className="w-px h-8 bg-white/10 mx-2" />
              <button onClick={endInterview} className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-2xl flex items-center gap-3 shadow-lg shadow-red-600/20 transition-all active:scale-95">
                <PhoneOff className="w-4 h-4" /> End Session
              </button>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-4 px-6 py-4 bg-white/5 rounded-2xl max-w-2xl mx-auto w-full border border-white/10">
            <input
              type="text" value={inputText} onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendText()}
              placeholder="Type your message..."
              className="flex-1 bg-transparent outline-none text-white text-sm"
            />
            <button onClick={handleSendText} className="p-2.5 bg-brand-600 rounded-xl hover:bg-brand-700">
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="w-96 flex flex-col border-l border-white/5" style={{ background: 'rgba(13,15,22,0.8)' }}>
          <div className="flex border-b border-white/5">
            <button
              onClick={() => setActivePanel('transcript')}
              className={`flex-1 py-5 text-[10px] font-black uppercase tracking-widest transition-all ${activePanel === 'transcript' ? 'text-brand-400 border-b-2 border-brand-500' : 'text-white/30 hover:text-white/50'}`}
            >Transcript</button>
            <button
              onClick={() => setActivePanel('insights')}
              className={`flex-1 py-5 text-[10px] font-black uppercase tracking-widest transition-all ${activePanel === 'insights' ? 'text-brand-400 border-b-2 border-brand-500' : 'text-white/30 hover:text-white/50'}`}
            >Insights</button>
          </div>

          {/* ── Transcript Panel ── */}
          {activePanel === 'transcript' && (
            <div ref={transcriptRef} className="flex-1 overflow-y-auto p-6 space-y-6">
              {transcript.map((msg, i) => (
                <div key={i} className={`flex flex-col gap-2 ${msg.speaker === 'ai' ? 'items-start' : 'items-end'}`}>
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">{msg.speaker === 'ai' ? 'HireAI' : 'You'}</div>
                  <div className={`px-5 py-4 rounded-2xl text-[13px] leading-relaxed transition-opacity duration-300 ${
                    msg.speaker === 'ai'
                      ? 'bg-brand-500/10 text-brand-50 border border-brand-500/20 rounded-tl-sm'
                      : 'bg-surface-800 text-white rounded-tr-sm'
                  } ${msg.partial ? 'opacity-70 italic' : 'opacity-100'}`}>
                    {msg.text}
                    {msg.partial && <span className="inline-block w-1.5 h-3.5 bg-white/50 ml-1 animate-pulse rounded-sm align-middle" />}
                  </div>
                </div>
              ))}
              {candidateSpeaking && !aiSpeaking && (
                <div className="flex gap-1.5 p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10 self-end">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
              )}
              {aiSpeaking && (
                <div className="flex gap-1.5 p-4 bg-brand-500/5 rounded-xl border border-brand-500/10 self-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
              )}
            </div>
          )}

          {/* ── Insights Panel ── */}
          {activePanel === 'insights' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Live Score Rings */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4">Live Performance</div>
                <div className="flex items-center justify-around py-4 px-2 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <ScoreRing score={scores.technical} label="Technical" color="#6366f1" size={72} />
                  <ScoreRing score={scores.communication} label="Comms" color="#22c55e" size={72} />
                  <ScoreRing score={scores.confidence} label="Confidence" color="#f59e0b" size={72} />
                </div>
                <p className="text-[10px] text-white/20 text-center mt-2 font-medium">Scores update in real-time as you answer</p>
              </div>

              {/* Round Progress */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Round Progress</div>
                <div className="space-y-2">
                  {rounds.map((r, i) => {
                    const isDone = i < currentRoundIndex
                    const isCurrent = r.id === currentRound
                    const isPending = i > currentRoundIndex
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                        style={{
                          background: isCurrent ? `${r.color}15` : 'rgba(255,255,255,0.02)',
                          border: isCurrent ? `1px solid ${r.color}40` : '1px solid rgba(255,255,255,0.04)',
                        }}>
                        <span className="text-base">{r.icon}</span>
                        <span className={`flex-1 text-xs font-bold ${isCurrent ? 'text-white' : isDone ? 'text-white/40 line-through' : 'text-white/20'}`}>
                          {r.label}
                        </span>
                        {isDone && <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Done ✓</span>}
                        {isCurrent && <span className="text-[10px] font-black uppercase tracking-widest animate-pulse" style={{ color: r.color }}>Live</span>}
                        {isPending && <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Upcoming</span>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* AI Tips */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">AI Tips</div>
                <div className="space-y-2">
                  {[
                    { icon: '🎯', tip: 'Give specific examples (STAR method)' },
                    { icon: '🗣️', tip: 'Speak clearly and at a steady pace' },
                    { icon: '⏱️', tip: 'Keep answers between 1–2 minutes' },
                    { icon: '💡', tip: 'Ask clarifying questions if needed' },
                  ].map(({ icon, tip }) => (
                    <div key={tip} className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <span className="text-sm mt-0.5">{icon}</span>
                      <span className="text-[12px] text-white/40 font-medium leading-relaxed">{tip}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Integrity Status */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Session Integrity</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-xs text-white/50 font-semibold">Tab Switches</span>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${tabStatus.switchCount === 0 ? 'bg-emerald-500/10 text-emerald-400' : tabStatus.severity === 'critical' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {tabStatus.switchCount} {tabStatus.switchCount === 0 ? '✓ Clean' : `⚠ Strike${tabStatus.switchCount > 1 ? 's' : ''}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-xs text-white/50 font-semibold">Camera</span>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${proctorStatus.isWarning ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {proctorStatus.isWarning ? `⚠ ${proctorStatus.message.split(':')[1]?.trim() || 'Alert'}` : `✓ ${proctorStatus.facesDetected} face detected`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-xs text-white/50 font-semibold">Session Time</span>
                    <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-brand-500/10 text-brand-400">
                      {formatTime(elapsed)}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  )
}
