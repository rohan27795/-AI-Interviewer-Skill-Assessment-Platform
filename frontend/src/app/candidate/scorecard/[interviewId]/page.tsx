'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import axios from 'axios'
import {
  CheckCircle, TrendingUp, Loader2, Brain,
  Briefcase, Clock, Home, ChevronRight,
  Star, ArrowRight, Sparkles, AlertCircle,
  AlertTriangle, Award, MessageSquare, Target, Zap, RefreshCw
} from 'lucide-react'
import { getApiUrl } from '@/lib/api'

// ── Animated Score Ring ────────────────────────────────────────────────────────
function AnimatedScoreRing({
  score, size = 120, strokeWidth = 9, color = '#6366f1', delay = 0
}: { score: number; size?: number; strokeWidth?: number; color?: string; delay?: number }) {
  const [animated, setAnimated] = useState(false)
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${animated ? dash : 0} ${c}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 8px ${color}80)` }} />
    </svg>
  )
}

// ── Skill Bar (Candidate-friendly) ────────────────────────────────────────────
function SkillBar({ label, score, description, delay = 0 }: {
  label: string; score: number | null | undefined; description: string; delay?: number
}) {
  const [animated, setAnimated] = useState(false)
  const isNull = score === null || score === undefined
  const sc = isNull ? 0 : Math.max(0, Math.min(100, Number(score) || 0))
  const { color, bg, label: perf } = sc >= 80 ? { color: '#22c55e', bg: '#f0fdf4', label: 'Excellent' }
    : sc >= 65 ? { color: '#3b82f6', bg: '#eff6ff', label: 'Good' }
    : sc >= 50 ? { color: '#f59e0b', bg: '#fffbeb', label: 'Fair' }
    : { color: '#ef4444', bg: '#fef2f2', label: 'Needs Work' }

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  if (isNull) return (
    <div className="flex items-center gap-4 py-3 border-b border-surface-100 last:border-0">
      <div className="w-40 shrink-0">
        <div className="text-sm font-semibold text-surface-700">{label}</div>
        <div className="text-xs text-surface-400">{description}</div>
      </div>
      <div className="flex-1 h-2.5 bg-surface-100 rounded-full">
        <div className="h-full w-0 bg-surface-200 rounded-full" />
      </div>
      <span className="text-xs font-bold text-surface-400 italic shrink-0 w-24 text-right">Not Assessed</span>
    </div>
  )

  return (
    <div className="flex items-center gap-4 py-3 border-b border-surface-100 last:border-0">
      <div className="w-40 shrink-0">
        <div className="text-sm font-semibold text-surface-700">{label}</div>
        <div className="text-xs text-surface-400">{description}</div>
      </div>
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: animated ? `${sc}%` : '0%', backgroundColor: color, boxShadow: `0 0 8px ${color}60` }} />
      </div>
      <div className="shrink-0 w-24 text-right">
        <span className="text-sm font-black" style={{ color }}>{Math.round(sc)}</span>
        <span className="text-xs text-surface-400 font-medium">/100</span>
        <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{perf}</span>
      </div>
    </div>
  )
}

// ── Round Journey Timeline ────────────────────────────────────────────────────
function RoundTimeline({ roundsDone, roundSummaries }: { roundsDone: string[]; roundSummaries: any[] }) {
  // intro is NOT included in the weighted overall score — it's just an icebreaker
  const allRounds = [
    { id: 'intro',      label: 'Introduction', icon: '👋', color: '#6366f1', weighted: false },
    { id: 'technical',  label: 'Technical',    icon: '💻', color: '#a855f7', weighted: true  },
    { id: 'behavioral', label: 'Behavioural',  icon: '🧠', color: '#f59e0b', weighted: true  },
    { id: 'salary',     label: 'Discussion',   icon: '💰', color: '#22c55e', weighted: true  },
  ]

  return (
    <div>
      <div className="relative">
        {/* Connecting line */}
        <div className="absolute top-6 left-6 right-6 h-0.5 bg-surface-200 z-0" />
        <div className="relative z-10 flex items-start justify-between">
          {allRounds.map((round) => {
            const done = roundsDone.includes(round.id)
            const summary = roundSummaries?.find((r: any) => r.round === round.id)
            const score = summary?.score
            return (
              <div key={round.id} className="flex flex-col items-center gap-2 flex-1 first:items-start last:items-end">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shadow-sm transition-all
                  ${done ? 'shadow-lg scale-110' : 'opacity-30 grayscale'}`}
                  style={done ? { background: `${round.color}20`, border: `2px solid ${round.color}`, boxShadow: `0 0 12px ${round.color}30` } : { background: '#f1f5f9', border: '2px solid #e2e8f0' }}>
                  {round.icon}
                </div>
                <div className="text-center">
                  <div className={`text-xs font-bold capitalize ${done ? 'text-surface-800' : 'text-surface-400'}`}>
                    {round.label}
                  </div>
                  {done && score != null && (
                    <div className="text-[10px] font-black mt-0.5" style={{ color: round.color }}>
                      {Math.round(score)}/100
                    </div>
                  )}
                  {done && !round.weighted && (
                    <div className="text-[10px] text-surface-400 mt-0.5 italic">icebreaker</div>
                  )}
                  {!done && <div className="text-[10px] text-surface-300 mt-0.5">Not reached</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-[10px] text-surface-400 mt-4 text-center">
        ★ The Introduction round is an icebreaker and is <strong>not included</strong> in your overall score.
        Your overall score is calculated by averaging your core performance skills above (excluding any that were not assessed).
      </p>
    </div>
  )
}

// ── Stat Pill ──────────────────────────────────────────────────────────────────
function StatPill({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/15">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}30` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/50">{label}</div>
        <div className="text-sm font-bold text-white">{value}</div>
      </div>
    </div>
  )
}

// ── Score label for candidate (no hire/no-hire language) ─────────────────────
function getCandidateScoreLabel(score: number): { label: string; sublabel: string; color: string } {
  if (score <= 0)  return { label: 'Pending Review', sublabel: 'Your interview is being reviewed by our team', color: '#94a3b8' }
  if (score >= 85) return { label: 'Outstanding', sublabel: 'Top-tier performance across all areas', color: '#22c55e' }
  if (score >= 75) return { label: 'Strong', sublabel: 'Solid performance with clear strengths', color: '#3b82f6' }
  if (score >= 60) return { label: 'Promising', sublabel: 'Demonstrated good potential with clear strengths', color: '#a855f7' }
  if (score >= 45) return { label: 'Developing', sublabel: 'Good start — keep building on your experience', color: '#f59e0b' }
  return { label: 'Early Stage', sublabel: 'Great learning experience — keep practising!', color: '#f97316' }
}

// ── Sanitise AI feedback for candidates (remove recruiter-internal verdicts) ──
// Strategy: replace whole sentences that contain verdict language with a neutral
// rewrite rather than stripping individual words, which can leave fragments.
function sanitiseFeedback(raw: string): string {
  if (!raw) return ''

  // Step 1: Sentence-level replacement — catch sentences that contain internal
  // verdict phrases and replace the whole sentence with nothing (removed cleanly).
  const verdictSentencePattern =
    /[^.!?]*\b(strong[- ]hire|strong[- ]no[- ]hire|no[- ]hire|\bhire\b|do not (move forward|proceed)|not (moving forward|proceeding)|recommend against|reject(ed|ion)?)\b[^.!?]*[.!?]?/gi

  let cleaned = raw.replace(verdictSentencePattern, '').trim()

  // Step 2: If nothing was left after removal, return a neutral fallback
  if (!cleaned || cleaned.length < 20) {
    return 'Based on the interview, there are areas for improvement before the next stage.'
  }

  // Step 3: Clean up double spaces and leading/trailing punctuation
  return cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,;.\s]+|[,;.\s]+$/g, '')
    .trim()
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CandidateScorecardPage({ params }: { params: { interviewId: string } }) {
  const [loading, setLoading] = useState(true)
  const [assessment, setAssessment] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollingCount, setPollingCount] = useState(0)
  const [retryKey, setRetryKey] = useState(0)
  const [heroVisible, setHeroVisible] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const handleRetry = () => {
    setLoading(true); setError(null); setPollingCount(0); setRetryKey(k => k + 1)
  }

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    let cancelled = false

    const fetchAssessment = async (attempt = 0) => {
      try {
        const token = localStorage.getItem('hireai_token') || localStorage.getItem('sb-access-token') || ''
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        const res = await axios.get(`${getApiUrl()}/api/v1/assessments/${params.interviewId}`, { headers })

        const data = res.data
        const dr = data.detailed_report || {}
        const totalTurns = dr.total_turns_assessed || dr.transcript_turns || 0
        const roundsDone = dr.rounds_completed || []
        const overallScore = data.overall_score || 0

        // If backend returned 200 but data is clearly empty/unprocessed, keep polling
        // This handles the race condition where scorecard is queued but not yet generated
        const isEmpty = overallScore === 0 && totalTurns === 0 && roundsDone.length === 0
        if (isEmpty && attempt < 12) {
          setPollingCount(attempt + 1)
          timeout = setTimeout(() => fetchAssessment(attempt + 1), 4000)
          return
        }

        if (!cancelled) { setAssessment(data); setTimeout(() => setHeroVisible(true), 100) }
      } catch (err: any) {
        if (cancelled) return
        const status = err.response?.status
        if (status === 202 && attempt < 12) {
          setPollingCount(attempt + 1)
          timeout = setTimeout(() => fetchAssessment(attempt + 1), 5000)
          return
        } else if (status === 202) setError('Taking longer than expected. Please check back in a few minutes.')
        else if (status === 404) setError('Your scorecard is still being generated. Please try again in a moment.')
        else setError('Could not load your scorecard. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    setLoading(true); setError(null); setAssessment(null)
    fetchAssessment(0)
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [params.interviewId, retryKey])

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
      <div className="text-center mb-8">
        <div className="w-20 h-20 rounded-3xl bg-white/10 flex items-center justify-center mx-auto mb-6 border border-white/20">
          <Brain className="w-10 h-10 text-white animate-pulse" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">Analysing Your Interview</h2>
        <p className="text-white/50 text-sm max-w-xs mx-auto leading-relaxed">
          Our AI is reviewing your responses, communication style, and performance across all rounds.
        </p>
        {pollingCount > 0 && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-white/40">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking... attempt {pollingCount} of 12
          </div>
        )}
      </div>
      {/* Progress steps */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {[
          { label: 'Analysing transcript', done: pollingCount >= 1 },
          { label: 'Scoring each dimension', done: pollingCount >= 2 },
          { label: 'Generating feedback', done: pollingCount >= 4 },
          { label: 'Preparing scorecard', done: pollingCount >= 6 },
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-500
              ${step.done ? 'bg-green-500 border-green-500' : 'border-white/20 bg-white/5'}`}>
              {step.done && <CheckCircle className="w-3 h-3 text-white" />}
            </div>
            <span className={step.done ? 'text-white font-medium' : 'text-white/30'}>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Error state ─────────────────────────────────────────────────────────────
  if (error || !assessment) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
      <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-10 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-8 h-8 text-amber-400" />
        </div>
        <h2 className="text-xl font-black text-white mb-2">Scorecard Not Ready</h2>
        <p className="text-white/50 text-sm mb-8 leading-relaxed">{error || 'Your scorecard is still being generated.'}</p>
        <div className="space-y-3">
          <button onClick={handleRetry}
            className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl transition-all active:scale-95">
            Try Again
          </button>
          <Link href="/candidate/dashboard"
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-2xl border border-white/20 transition-all">
            <Home className="w-4 h-4" /> Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )

  // ── Parse data ───────────────────────────────────────────────────────────────
  const dr = assessment.detailed_report || {}
  const completionStatus: string = dr.completion_status || 'completed'
  const isTabGuard = completionStatus === 'tab_guard'
  const isEarlyExit = completionStatus === 'early_exit'
  const roundsDone: string[] = dr.rounds_completed || []
  const totalTurns: number = dr.total_turns_assessed || dr.transcript_turns || 0
  const overallScore = Math.round(assessment.overall_score || 0)
  const jobTitle = dr.job_title || 'the role'
  const candidateName = dr.candidate_name || 'Candidate'

  const scoreLabel = isTabGuard ? null : getCandidateScoreLabel(overallScore)

  const scores = {
    technical: assessment.technical_score ?? dr.technical_score,
    behavioral: assessment.behavioral_score ?? dr.behavioral_score,
    communication: assessment.communication_score ?? dr.communication_score,
    cultural_fit: assessment.cultural_fit_score ?? dr.cultural_fit_score,
    problem_solving: assessment.problem_solving_score ?? dr.problem_solving_score,
  }

  const allScoresNull = scores.technical == null && scores.behavioral == null &&
    scores.communication == null && scores.cultural_fit == null && scores.problem_solving == null

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const token = localStorage.getItem('hireai_token') || localStorage.getItem('sb-access-token') || ''
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      await axios.post(`${getApiUrl()}/api/v1/assessments/${params.interviewId}/regenerate`, {}, { headers })
      // Wait 15 seconds then re-fetch the assessment
      setTimeout(() => {
        setRegenerating(false)
        handleRetry()
      }, 15000)
    } catch (err) {
      console.error('Regeneration failed:', err)
      setRegenerating(false)
    }
  }

  // ── Tab guard state ──────────────────────────────────────────────────────────
  if (isTabGuard) return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #1a0a0a, #2d1515, #1a0a0a)' }}>
      {/* Nav */}
      <nav className="h-16 flex items-center px-6 border-b border-white/5">
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-black text-sm tracking-wider">HireAI</span>
          </div>
          <Link href="/candidate/dashboard" className="text-white/40 hover:text-white text-sm font-medium transition-colors">
            Dashboard
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="w-24 h-24 rounded-3xl bg-red-500/20 border-2 border-red-500/30 flex items-center justify-center mx-auto mb-8">
          <AlertCircle className="w-12 h-12 text-red-400" />
        </div>
        <h1 className="text-3xl font-black text-white mb-4">Session Ended Early</h1>
        <p className="text-white/50 text-base leading-relaxed mb-8 max-w-md mx-auto">
          Your interview session was ended by our AI monitoring system. This happens when the browser
          tab loses focus during a live interview session.
        </p>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-8 text-left">
          <div className="text-xs font-black uppercase tracking-widest text-white/30 mb-4">What this means</div>
          <ul className="space-y-3">
            {[
              'Your performance from this session cannot be scored fairly',
              'The recruiter has been notified with the session details',
              'This does not affect your profile or future applications',
              'You may be invited to re-take the interview at the recruiter\'s discretion',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-white/60">
                <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/candidate/jobs"
            className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-95">
            <Briefcase className="w-4 h-4" /> Browse Other Jobs
          </Link>
          <Link href="/candidate/dashboard"
            className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold py-4 rounded-2xl border border-white/20 transition-all">
            <Home className="w-4 h-4" /> Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )

  // ── Normal / Early exit scorecard ────────────────────────────────────────────
  const heroGradient = isEarlyExit
    ? 'linear-gradient(135deg, #1a1200 0%, #292006 40%, #1a1200 100%)'
    : 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)'

  return (
    <div className="min-h-screen bg-surface-50">
      {/* ── HERO SECTION ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden pb-24" style={{ background: heroGradient }}>
        {/* Ambient blobs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ background: isEarlyExit ? '#f59e0b' : '#6366f1' }} />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full opacity-10 blur-3xl"
          style={{ background: isEarlyExit ? '#d97706' : '#a855f7' }} />

        {/* Nav */}
        <nav className="relative z-10 h-16 flex items-center px-6 border-b border-white/5">
          <div className="max-w-4xl mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-black text-sm tracking-wider">HireAI</span>
            </div>
            <Link href="/candidate/dashboard" className="text-white/40 hover:text-white text-sm font-medium transition-colors flex items-center gap-1">
              Dashboard <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 max-w-4xl mx-auto px-6 pt-12 pb-8">
          {isEarlyExit && (
            <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-500/30 rounded-full px-4 py-2 text-amber-300 text-xs font-bold uppercase tracking-widest mb-6">
              <AlertTriangle className="w-3.5 h-3.5" /> Partial Results — Interview Ended Early
            </div>
          )}

          <div className="flex flex-col lg:flex-row lg:items-center gap-10">
            {/* Score ring */}
            <div className="relative w-32 h-32 flex-shrink-0">
              <AnimatedScoreRing
                score={overallScore}
                size={128}
                strokeWidth={9}
                color={isEarlyExit ? '#f59e0b' : scoreLabel?.color || '#6366f1'}
                delay={300}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-white leading-none">{overallScore}</span>
                <span className="text-xs text-white/40 font-bold">/100</span>
              </div>
            </div>

            {/* Text */}
            <div className="flex-1">
              <div className="text-xs font-black uppercase tracking-[0.3em] text-white/40 mb-2">Interview Complete</div>
              <h1 className="text-3xl lg:text-4xl font-black text-white leading-tight mb-2">
                {isEarlyExit ? 'Partial Results' : scoreLabel?.label}
              </h1>
              <p className="text-white/60 text-base mb-6 leading-relaxed">
                {isEarlyExit
                  ? `You completed ${roundsDone.length} of 4 rounds — results are based on the rounds you participated in.`
                  : scoreLabel?.sublabel}
              </p>

              {/* Stat pills */}
              <div className="flex flex-wrap gap-3">
                <StatPill icon={Briefcase} label="Role" value={jobTitle} color="#a855f7" />
                <StatPill icon={Target} label="Rounds Done" value={`${roundsDone.length} / 4`} color="#22c55e" />
                <StatPill icon={MessageSquare} label="Exchanges" value={`${totalTurns}`} color="#6366f1" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT (overlaps hero bottom) ──────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 -mt-12 pb-16 space-y-6 relative z-10">

        {/* Skill Performance Card */}
        <div className="bg-white rounded-3xl border border-surface-100 shadow-xl overflow-hidden">
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center">
                <Zap className="w-4 h-4 text-brand-600" />
              </div>
              <h2 className="text-base font-black text-surface-900">Your Performance</h2>
            </div>
            <p className="text-xs text-surface-400 font-medium ml-11">
              Only the rounds you completed are counted in your overall score. Rounds that did not occur are excluded.
            </p>
          </div>
          <div className="px-6 pb-6 pt-2">
            <SkillBar label="Technical Skills" score={scores.technical}
              description="Problem solving & coding" delay={100} />
            <SkillBar label="Communication" score={scores.communication}
              description="Clarity & articulation" delay={200} />
            <SkillBar label="Behavioural Skills" score={scores.behavioral}
              description="Situational responses" delay={300} />
            <SkillBar label="Cultural Fit" score={scores.cultural_fit}
              description="Team & values alignment" delay={400} />
            <SkillBar label="Problem Solving" score={scores.problem_solving}
              description="Analytical thinking" delay={500} />

            {/* Show regenerate button if all scores are null */}
            {allScoresNull && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800">No scores were generated</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      This may happen if the interview session had technical issues. You can try regenerating the assessment.
                    </p>
                  </div>
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 shrink-0"
                  >
                    {regenerating ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Regenerating...</>
                    ) : (
                      <><RefreshCw className="w-4 h-4" /> Regenerate</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Feedback */}
        {(dr.hiring_recommendation || dr.verdict_reasoning) && (() => {
          const rawText = dr.hiring_recommendation || dr.verdict_reasoning || ''
          const cleaned = sanitiseFeedback(rawText)
          if (!cleaned) return null
          return (
            <div className="bg-white rounded-3xl border border-surface-100 shadow-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                </div>
                <h2 className="text-base font-black text-surface-900">Interviewer Feedback</h2>
              </div>
              <blockquote className="border-l-4 border-brand-400 pl-5 py-2 text-sm text-surface-700 italic leading-relaxed bg-surface-50 rounded-r-2xl">
                {cleaned}
              </blockquote>
            </div>
          )
        })()}

        {/* Strengths & Growth Grid */}
        {(dr.key_strengths?.length > 0 || dr.areas_of_improvement?.length > 0) && (
          <div className="grid sm:grid-cols-2 gap-6">
            {dr.key_strengths?.length > 0 && (
              <div className="bg-white rounded-3xl border border-green-100 shadow-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center">
                    <Award className="w-4 h-4 text-green-600" />
                  </div>
                  <h2 className="text-sm font-black text-surface-900 uppercase tracking-widest">Your Strengths</h2>
                </div>
                <ul className="space-y-3">
                  {dr.key_strengths.slice(0, 5).map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckCircle className="w-3 h-3 text-green-600" />
                      </div>
                      <span className="text-sm text-surface-700 font-medium leading-snug">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {dr.areas_of_improvement?.length > 0 && (
              <div className="bg-white rounded-3xl border border-amber-100 shadow-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-amber-600" />
                  </div>
                  <h2 className="text-sm font-black text-surface-900 uppercase tracking-widest">Growth Areas</h2>
                </div>
                <ul className="space-y-3">
                  {dr.areas_of_improvement.slice(0, 5).map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <TrendingUp className="w-3 h-3 text-amber-600" />
                      </div>
                      <span className="text-sm text-surface-700 font-medium leading-snug">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Round Journey */}
        {roundsDone.length > 0 && (
          <div className="bg-white rounded-3xl border border-surface-100 shadow-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center">
                <Target className="w-4 h-4 text-brand-600" />
              </div>
              <div>
                <h2 className="text-base font-black text-surface-900">Interview Journey</h2>
                <p className="text-xs text-surface-400 mt-0.5">Rounds you participated in are highlighted</p>
              </div>
            </div>
            <RoundTimeline roundsDone={roundsDone} roundSummaries={dr.round_summaries || []} />
          </div>
        )}

        {/* What Happens Next */}
        <div className="rounded-3xl p-6 border"
          style={{ background: 'linear-gradient(135deg, #f0f4ff, #faf0ff)', borderColor: '#e0e7ff' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center">
              <Star className="w-4 h-4 text-brand-600" />
            </div>
            <h2 className="text-base font-black text-surface-900">What Happens Next?</h2>
          </div>
          <div className="space-y-3 ml-11">
            {[
              { step: '1', text: 'The recruiter will review your AI-generated assessment report' },
              { step: '2', text: 'You\'ll receive an email notification with the next steps within 5 business days' },
              { step: '3', text: 'If selected, you\'ll receive a formal offer or next-round interview invitation' },
            ].map(item => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-black text-white">{item.step}</span>
                </div>
                <p className="text-sm text-surface-700 font-medium leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 pb-6">
          <Link href="/candidate/jobs"
            className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-brand-600/20 transition-all active:scale-95">
            <Briefcase className="w-4 h-4" /> Browse More Jobs
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/candidate/dashboard"
            className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-surface-50 text-surface-700 font-bold py-4 rounded-2xl border border-surface-200 transition-all active:scale-95">
            <Home className="w-4 h-4" /> Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
