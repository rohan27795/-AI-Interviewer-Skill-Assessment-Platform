'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
    ArrowLeft, CheckCircle, TrendingUp,
    Clock, Loader2, AlertCircle,
    Shield, AlertTriangle, Send, BarChart3,
    Target, Brain, ChevronRight,
    Flag, Zap, Award, MessageSquare, Bot, Search
} from 'lucide-react'
import axios from 'axios'
import { getApiUrl } from '@/lib/api'

// ── Score Ring ─────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 88, strokeWidth = 7, color = '#6366f1' }: {
    score: number; size?: number; strokeWidth?: number; color?: string
}) {
    const r = (size - strokeWidth) / 2
    const c = 2 * Math.PI * r
    const dash = (Math.max(0, Math.min(100, score)) / 100) * c
    return (
        <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1.2s ease', filter: `drop-shadow(0 0 6px ${color}60)` }} />
        </svg>
    )
}

// ── Score Bar with N/A ─────────────────────────────────────────────────────────
function ScoreBar({ label, icon: Icon, score }: { label: string; icon?: any; score: number | null | undefined }) {
    const isNull = score === null || score === undefined
    const sc = isNull ? 0 : Math.max(0, Math.min(100, Number(score) || 0))
    const color = sc >= 80 ? '#22c55e' : sc >= 65 ? '#6366f1' : sc >= 50 ? '#f59e0b' : '#ef4444'

    return (
        <div className="flex items-center gap-4 py-3 border-b border-surface-50 last:border-0">
            <div className="w-36 shrink-0 flex items-center gap-2">
                {Icon && <Icon className="w-3.5 h-3.5 text-surface-400 shrink-0" />}
                <span className="text-sm font-semibold text-surface-700">{label}</span>
            </div>
            <div className="flex-1 h-2 bg-surface-100 rounded-full overflow-hidden">
                {isNull
                    ? <div className="h-full w-full bg-surface-200 animate-pulse rounded-full" />
                    : <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${sc}%`, backgroundColor: color }} />}
            </div>
            <div className="w-20 text-right shrink-0">
                {isNull ? (
                    <span className="text-xs italic text-surface-400 font-medium">Not Assessed</span>
                ) : (
                    <>
                        <span className="text-sm font-black" style={{ color }}>{Math.round(sc)}</span>
                        <span className="text-xs text-surface-400">/100</span>
                    </>
                )}
            </div>
        </div>
    )
}

// ── Verdict config ─────────────────────────────────────────────────────────────
const VERDICTS: Record<string, { label: string; icon: string; bg: string; text: string; border: string; dot: string }> = {
    strong_hire:    { label: 'Strong Hire',    icon: '🚀', bg: 'bg-green-50',   text: 'text-green-800',  border: 'border-green-200', dot: 'bg-green-500' },
    hire:           { label: 'Hire',           icon: '✅', bg: 'bg-blue-50',    text: 'text-blue-800',   border: 'border-blue-200',  dot: 'bg-blue-500' },
    no_hire:        { label: 'No Hire',        icon: '❌', bg: 'bg-red-50',     text: 'text-red-800',    border: 'border-red-200',   dot: 'bg-red-500' },
    strong_no_hire: { label: 'Strong No Hire', icon: '🚫', bg: 'bg-red-100',    text: 'text-red-900',    border: 'border-red-300',   dot: 'bg-red-700' },
}

// ── Status Banner ──────────────────────────────────────────────────────────────
function StatusBanner({ status, turns, rounds }: { status: string; turns: number; rounds: string[] }) {
    if (status === 'tab_guard') return (
        <div className="flex items-start gap-4 bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
                <div className="font-black text-red-800 text-sm mb-1">Interview Terminated — AI Shield Proctoring Violation</div>
                <p className="text-sm text-red-600 leading-relaxed">
                    This session was automatically ended by the AI Shield system after a tab-switching violation was detected.
                    <strong className="font-bold"> Skill scores cannot be generated</strong> for terminated sessions to ensure assessment fairness.
                    Only the security report is available.
                </p>
            </div>
        </div>
    )
    if (status === 'early_exit') return (
        <div className="flex items-start gap-4 bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
                <div className="font-black text-amber-800 text-sm mb-1">Partial Assessment — Interview Ended Early</div>
                <p className="text-sm text-amber-600 leading-relaxed">
                    The candidate ended the session after <strong>{turns} exchange(s)</strong>.
                    Only rounds that were conducted are scored. Unreached rounds are marked
                    &quot;Not Assessed&quot;. Rounds completed: <strong>{rounds.length > 0 ? rounds.join(', ') : 'none'}</strong>.
                </p>
            </div>
        </div>
    )
    return null
}

// ── Round Summary Card ─────────────────────────────────────────────────────────
function RoundCard({ round }: { round: any }) {
    const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
        intro:       { bg: 'bg-indigo-50 border-indigo-100',     text: 'text-indigo-700',  icon: '👋' },
        technical:   { bg: 'bg-purple-50 border-purple-100',     text: 'text-purple-700',  icon: '💻' },
        behavioral:  { bg: 'bg-amber-50 border-amber-100',       text: 'text-amber-700',   icon: '🧠' },
        salary:      { bg: 'bg-emerald-50 border-emerald-100',   text: 'text-emerald-700', icon: '💰' },
    }
    const style = colorMap[round.round] || colorMap.intro
    const score = round.score
    return (
        <div className={`rounded-2xl border p-5 ${style.bg}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-base">{style.icon}</span>
                    <span className={`text-xs font-black uppercase tracking-widest ${style.text}`}>
                        {round.round}
                    </span>
                </div>
                {score != null ? (
                    <span className={`text-sm font-black px-2.5 py-0.5 rounded-xl ${style.text} bg-white/80 border border-current/20`}>
                        {Math.round(score)}/100
                    </span>
                ) : (
                    <span className="text-xs italic text-surface-400 bg-white/80 px-2.5 py-0.5 rounded-xl">N/A</span>
                )}
            </div>
            {round.key_takeaways?.length > 0 && (
                <ul className="space-y-1.5 mb-3">
                    {round.key_takeaways.slice(0, 3).map((t: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-surface-700">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                            {t}
                        </li>
                    ))}
                </ul>
            )}
            {round.red_flags?.length > 0 && (
                <ul className="space-y-1.5">
                    {round.red_flags.slice(0, 2).map((f: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-red-700">
                            <Flag className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                            {f}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

// ── Main ──────────────────────────────────────────────────────────────────────
// ── Round config for transcript ────────────────────────────────────────────────
const ROUND_META: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
    intro:      { label: 'Introduction', icon: '👋', color: '#6366f1', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
    technical:  { label: 'Technical',    icon: '💻', color: '#a855f7', bg: 'bg-purple-50',  border: 'border-purple-200' },
    behavioral: { label: 'Behavioural',  icon: '🧠', color: '#f59e0b', bg: 'bg-amber-50',   border: 'border-amber-200'  },
    salary:     { label: 'Discussion',   icon: '💰', color: '#22c55e', bg: 'bg-emerald-50', border: 'border-emerald-200'},
}

export default function HRAssessmentPage({ params }: { params: { interviewId: string } }) {
    const [activeTab, setActiveTab] = useState('overview')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [assessment, setAssessment] = useState<any>(null)
    const [sendingOffer, setSendingOffer] = useState(false)
    const [offerSent, setOfferSent] = useState(false)
    const [offerError, setOfferError] = useState<string | null>(null)
    const [offerEmail, setOfferEmail] = useState<string | null>(null)
    const [transcript, setTranscript] = useState<any[]>([])
    const [transcriptLoading, setTranscriptLoading] = useState(false)
    const [transcriptError, setTranscriptError] = useState<string | null>(null)
    const [transcriptSearch, setTranscriptSearch] = useState('')

    useEffect(() => {
        const fetchAssessment = async () => {
            try {
                const token = localStorage.getItem('hireai_token')
                const API_URL = getApiUrl()
                const res = await axios.get(`${API_URL}/api/v1/assessments/${params.interviewId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                setAssessment(res.data)
            } catch (err: any) {
                setError(err.response?.status === 202
                    ? 'Assessment is still being generated. Please refresh shortly.'
                    : 'Failed to load assessment report.')
            } finally {
                setLoading(false)
            }
        }
        fetchAssessment()
    }, [params.interviewId])

    useEffect(() => {
        if (assessment?.detailed_report?.offer_sent) { setOfferSent(true) }
    }, [assessment])

    const fetchTranscript = useCallback(async () => {
        if (transcript.length > 0) return // already loaded
        setTranscriptLoading(true); setTranscriptError(null)
        try {
            const token = localStorage.getItem('hireai_token')
            const res = await axios.get(
                `${getApiUrl()}/api/v1/assessments/${params.interviewId}/transcript`,
                { headers: { Authorization: `Bearer ${token}` } }
            )
            setTranscript(res.data.transcript || [])
        } catch {
            setTranscriptError('Could not load transcript. Please try again.')
        } finally {
            setTranscriptLoading(false)
        }
    }, [params.interviewId, transcript.length])

    useEffect(() => {
        if (activeTab === 'transcript') fetchTranscript()
    }, [activeTab, fetchTranscript])

    const handleSendOffer = async () => {
        setSendingOffer(true); setOfferError(null)
        try {
            const token = localStorage.getItem('hireai_token')
            const res = await axios.post(
                `${getApiUrl()}/api/v1/assessments/${params.interviewId}/send-offer`, {},
                { headers: { Authorization: `Bearer ${token}` } }
            )
            setOfferSent(true); setOfferEmail(res.data.candidate_email || null)
        } catch (err: any) {
            setOfferError(err.response?.data?.detail || 'Failed to send offer. Try again.')
        } finally {
            setSendingOffer(false)
        }
    }

    if (loading) return (
        <div className="h-screen flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
            <p className="text-surface-600 font-medium text-sm">Loading assessment report...</p>
        </div>
    )

    if (error || !assessment) return (
        <div className="h-screen flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-black text-surface-900 mb-2">Report Unavailable</h2>
            <p className="text-surface-500 text-sm mb-6 max-w-xs">{error || 'Something went wrong.'}</p>
            <Link href="/recruiter/assessments" className="bg-brand-600 text-white px-6 py-3 rounded-xl font-bold text-sm">
                ← Back to Assessments
            </Link>
        </div>
    )

    // Parse assessment data
    const dr = assessment.detailed_report || {}
    const completionStatus: string = dr.completion_status || 'completed'
    const roundsDone: string[] = dr.rounds_completed || []
    const totalTurns: number = dr.total_turns_assessed || 0
    const isTabGuard = completionStatus === 'tab_guard'
    const isEarlyExit = completionStatus === 'early_exit'

    const candidateName = dr.candidate_name || 'Candidate'
    const jobTitle = dr.job_title || 'Unknown Role'
    const overallScore = isTabGuard ? 0 : Math.round(assessment.overall_score || 0)

    const scores = {
        technical: assessment.technical_score ?? dr.technical_score,
        behavioral: assessment.behavioral_score ?? dr.behavioral_score,
        communication: assessment.communication_score ?? dr.communication_score,
        cultural_fit: assessment.cultural_fit_score ?? dr.cultural_fit_score,
        problem_solving: assessment.problem_solving_score ?? dr.problem_solving_score,
    }

    const verdict = assessment.verdict || 'no_hire'
    const verdictCfg = VERDICTS[verdict] || VERDICTS.no_hire

    const sr = dr.security_report || {}
    const integrityScore = Math.round(sr.integrity_score ?? 100)
    const tabSwitches = sr.tab_switches || 0
    const faceAlerts = sr.face_alerts || 0

    // Score color for ring
    const ringColor = isTabGuard ? '#ef4444'
        : overallScore >= 85 ? '#22c55e'
        : overallScore >= 70 ? '#6366f1'
        : overallScore >= 50 ? '#f59e0b' : '#ef4444'

    const TABS = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'security', label: 'Security', icon: Shield },
        { id: 'transcript', label: 'Transcript', icon: Brain },
    ]

    return (
        <div className="bg-surface-50 min-h-screen">

            {/* ── TOP NAV ──────────────────────────────────────────────────────── */}
            <div className="bg-white border-b border-surface-100 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/recruiter/assessments"
                        className="flex items-center gap-2 text-sm font-bold text-surface-600 hover:text-surface-900 transition-colors">
                        <ArrowLeft className="w-4 h-4" /> All Assessments
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-surface-500">
                        <span>Interview ID:</span>
                        <code className="bg-surface-100 px-2 py-0.5 rounded font-mono text-surface-700">
                            {params.interviewId.slice(0, 12)}…
                        </code>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8">

                {/* Status Banner */}
                <StatusBanner status={completionStatus} turns={totalTurns} rounds={roundsDone} />

                {/* ── CANDIDATE HEADER CARD ─────────────────────────────────────── */}
                <div className="bg-white rounded-3xl border border-surface-100 shadow-card p-6 mb-6">
                    <div className="flex flex-col xl:flex-row xl:items-center gap-6">

                        {/* Avatar + info */}
                        <div className="flex items-center gap-5">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black text-white shrink-0
                                ${isTabGuard ? 'bg-red-500' : 'bg-gradient-to-br from-brand-500 to-accent-500'}`}>
                                {candidateName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-surface-900">{candidateName}</h1>
                                <p className="text-surface-500 font-semibold text-sm">{jobTitle}</p>
                                <div className="flex flex-wrap gap-3 mt-2">
                                    <span className="flex items-center gap-1.5 text-xs text-surface-500 font-medium">
                                        <Clock className="w-3.5 h-3.5" /> {totalTurns} exchanges recorded
                                    </span>
                                    <span className="flex items-center gap-1.5 text-xs text-surface-500 font-medium">
                                        <Target className="w-3.5 h-3.5" /> {roundsDone.length}/4 rounds completed
                                    </span>
                                    {/* Completion badge */}
                                    <span className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border
                                        ${isTabGuard ? 'bg-red-50 text-red-700 border-red-200'
                                        : isEarlyExit ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-green-50 text-green-700 border-green-200'}`}>
                                        {isTabGuard ? '🔴 Tab Guard' : isEarlyExit ? '🟡 Early Exit' : '🟢 Completed'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Score + verdict + offer */}
                        <div className="xl:ml-auto flex flex-wrap items-center gap-6">

                            {/* Score ring */}
                            <div className="relative flex items-center justify-center">
                                <ScoreRing score={overallScore} size={88} color={ringColor} />
                                <div className="absolute flex flex-col items-center">
                                    <span className={`text-xl font-black ${isTabGuard ? 'text-red-500' : 'text-surface-900'}`}>
                                        {isTabGuard ? '—' : overallScore}
                                    </span>
                                    <span className="text-[9px] font-bold text-surface-400 uppercase tracking-widest">Score</span>
                                </div>
                            </div>

                            {/* Verdict + Integrity */}
                            <div className="flex flex-col gap-2">
                                <div className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl border font-bold text-sm ${verdictCfg.bg} ${verdictCfg.text} ${verdictCfg.border}`}>
                                    <div className={`w-2 h-2 rounded-full ${verdictCfg.dot}`} />
                                    {verdictCfg.icon} {verdictCfg.label}
                                </div>
                                <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-xs font-bold
                                    ${integrityScore >= 80 ? 'bg-green-50 text-green-700 border-green-200'
                                    : integrityScore >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-red-50 text-red-700 border-red-200'}`}>
                                    <Shield className="w-3.5 h-3.5" />
                                    Integrity: {integrityScore}%
                                </div>
                            </div>

                            {/* Send Offer */}
                            {!isTabGuard && (
                                <div className="flex flex-col gap-1.5">
                                    <button onClick={handleSendOffer} disabled={sendingOffer || offerSent}
                                        className={`flex items-center gap-2 font-bold text-sm px-5 py-3 rounded-2xl transition-all
                                            ${offerSent ? 'bg-green-100 text-green-700 border border-green-200 cursor-default'
                                            : 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 active:scale-95'}`}>
                                        {sendingOffer ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                                            : offerSent ? <><CheckCircle className="w-4 h-4" /> Offer Sent!</>
                                            : <><Send className="w-4 h-4" /> Send Offer</>}
                                    </button>
                                    {offerSent && offerEmail && (
                                        <p className="text-[10px] text-green-600 font-semibold text-center">✓ Sent to {offerEmail}</p>
                                    )}
                                    {offerError && (
                                        <p className="text-[10px] text-red-600 font-semibold max-w-[160px] text-center">{offerError}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── TABS ─────────────────────────────────────────────────────── */}
                <div className="flex gap-2 mb-6">
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all
                                ${activeTab === tab.id ? 'bg-surface-900 text-white shadow-sm' : 'bg-white text-surface-700 border border-surface-200 hover:bg-surface-50'}`}>
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ════════════════════ OVERVIEW TAB ════════════════════ */}
                {activeTab === 'overview' && (
                    <div className="grid xl:grid-cols-3 gap-6">

                        {/* LEFT: Score breakdown + Recommendation + Rounds */}
                        <div className="xl:col-span-2 space-y-6">

                            {/* Score Breakdown */}
                            <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6">
                                <div className="flex items-center gap-2 mb-5">
                                    <Zap className="w-4 h-4 text-brand-600" />
                                    <h2 className="font-black text-surface-900">Score Breakdown</h2>
                                </div>

                                {isTabGuard ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center bg-red-50 rounded-2xl border border-red-100">
                                        <AlertCircle className="w-10 h-10 mb-3 text-red-400" />
                                        <p className="font-black text-red-700 text-sm">Scores Withheld</p>
                                        <p className="text-sm text-red-500 mt-1 max-w-xs">
                                            Skill assessment is not possible for proctoring-terminated sessions.
                                            This prevents unfair scoring of partial data.
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <ScoreBar label="Technical" score={scores.technical} />
                                        <ScoreBar label="Behavioral" score={scores.behavioral} />
                                        <ScoreBar label="Communication" score={scores.communication} />
                                        <ScoreBar label="Cultural Fit" score={scores.cultural_fit} />
                                        <ScoreBar label="Problem Solving" score={scores.problem_solving} />
                                    </div>
                                )}
                            </div>

                            {/* AI Hiring Recommendation */}
                            <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Brain className="w-4 h-4 text-brand-600" />
                                    <h2 className="font-black text-surface-900">AI Hiring Recommendation</h2>
                                </div>
                                <div className={`rounded-2xl p-4 border ${verdictCfg.bg} ${verdictCfg.border}`}>
                                    <div className={`text-xs font-black uppercase tracking-widest mb-2 ${verdictCfg.text}`}>
                                        {verdictCfg.icon} Verdict: {verdictCfg.label}
                                    </div>
                                    <p className={`text-sm leading-relaxed font-medium ${verdictCfg.text}`}>
                                        {dr.verdict_reasoning || assessment.verdict_reasoning || 'No recommendation generated.'}
                                    </p>
                                </div>
                                {dr.hiring_recommendation && dr.hiring_recommendation !== dr.verdict_reasoning && (
                                    <div className="mt-4 bg-surface-50 rounded-2xl border border-surface-100 p-4">
                                        <div className="text-xs font-black uppercase tracking-wider text-surface-400 mb-2">Detailed Recommendation</div>
                                        <p className="text-sm text-surface-700 leading-relaxed">{dr.hiring_recommendation}</p>
                                    </div>
                                )}
                            </div>

                            {/* Round Analysis */}
                            {!isTabGuard && (
                                <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6">
                                    <div className="flex items-center justify-between mb-5">
                                        <div className="flex items-center gap-2">
                                            <Target className="w-4 h-4 text-brand-600" />
                                            <h2 className="font-black text-surface-900">Round Analysis</h2>
                                        </div>
                                        <span className="text-xs font-bold text-surface-400 bg-surface-100 px-2.5 py-1 rounded-full">
                                            {(dr.round_summaries || []).length} of 4 rounds assessed
                                        </span>
                                    </div>
                                    {dr.round_summaries?.length > 0 ? (
                                        <div className="grid sm:grid-cols-2 gap-4">
                                            {dr.round_summaries.map((round: any, i: number) => (
                                                <RoundCard key={i} round={round} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center py-10 text-surface-400 bg-surface-50 rounded-2xl border border-surface-100">
                                            <BarChart3 className="w-8 h-8 mb-2 text-surface-300" />
                                            <p className="text-sm font-bold text-surface-500">No round analysis available</p>
                                            <p className="text-xs mt-1">Interview was too brief for per-round breakdown</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* RIGHT: Strengths + Areas + Security preview */}
                        <div className="space-y-6">

                            {/* Quick stats */}
                            <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5">
                                <div className="text-xs font-black uppercase tracking-widest text-surface-400 mb-4">Session Stats</div>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { label: 'Rounds Done', value: `${roundsDone.length}/4`, color: 'text-brand-600' },
                                        { label: 'Exchanges', value: String(totalTurns), color: 'text-surface-900' },
                                        { label: 'Tab Switches', value: String(tabSwitches), color: tabSwitches > 0 ? 'text-red-600' : 'text-green-600' },
                                        { label: 'Face Alerts', value: String(faceAlerts), color: faceAlerts > 0 ? 'text-amber-600' : 'text-green-600' },
                                    ].map(stat => (
                                        <div key={stat.label} className="bg-surface-50 rounded-xl p-3 text-center border border-surface-100">
                                            <div className={`text-xl font-black ${stat.color}`}>{stat.value}</div>
                                            <div className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mt-0.5">{stat.label}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Key Strengths */}
                            <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <Award className="w-4 h-4 text-green-600" />
                                    <h2 className="font-black text-surface-900 text-sm uppercase tracking-widest">Key Strengths</h2>
                                </div>
                                {dr.key_strengths?.length > 0 ? (
                                    <ul className="space-y-2">
                                        {dr.key_strengths.map((s: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <div className="w-5 h-5 rounded-full bg-green-100 items-center justify-center flex shrink-0 mt-0.5">
                                                    <CheckCircle className="w-3 h-3 text-green-600" />
                                                </div>
                                                <span className="text-sm text-surface-700 font-medium leading-snug">{s}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-surface-400 italic">{isTabGuard ? 'N/A — session terminated' : 'No strengths data available'}</p>
                                )}
                            </div>

                            {/* Areas to Develop */}
                            <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <TrendingUp className="w-4 h-4 text-amber-600" />
                                    <h2 className="font-black text-surface-900 text-sm uppercase tracking-widest">Development Areas</h2>
                                </div>
                                {dr.areas_of_improvement?.length > 0 ? (
                                    <ul className="space-y-2">
                                        {dr.areas_of_improvement.map((s: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                                                    <TrendingUp className="w-3 h-3 text-amber-600" />
                                                </div>
                                                <span className="text-sm text-surface-700 font-medium leading-snug">{s}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-surface-400 italic">No improvement data available</p>
                                )}
                            </div>

                            {/* Security Quick Panel */}
                            <div className={`rounded-2xl border p-5 ${integrityScore >= 80 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                <div className="flex items-center gap-3 mb-3">
                                    <Shield className={`w-5 h-5 ${integrityScore >= 80 ? 'text-green-600' : 'text-red-500'}`} />
                                    <div>
                                        <div className="text-xs font-black uppercase tracking-widest text-surface-500">AI Shield</div>
                                        <div className={`text-xl font-black ${integrityScore >= 80 ? 'text-green-700' : 'text-red-600'}`}>
                                            {integrityScore}%
                                        </div>
                                    </div>
                                    <button onClick={() => setActiveTab('security')}
                                        className="ml-auto text-xs font-bold text-brand-600 hover:underline flex items-center gap-1">
                                        View <ChevronRight className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className={`text-xs font-bold uppercase tracking-widest ${integrityScore >= 80 ? 'text-green-600' : 'text-red-600'}`}>
                                    {sr.final_security_verdict === 'clear' ? '✓ Clear' : sr.final_security_verdict?.replace('_', ' ').toUpperCase() || 'CLEAR'}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ════════════════════ SECURITY TAB ════════════════════ */}
                {activeTab === 'security' && (
                    <div className="space-y-6">
                        {/* 3-stat header */}
                        <div className="grid lg:grid-cols-3 gap-5">
                            {/* Integrity verdict */}
                            <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6 text-center">
                                <div className="text-xs font-black uppercase tracking-widest text-surface-400 mb-4">Integrity Verdict</div>
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3
                                    ${sr.final_security_verdict === 'clear' ? 'bg-green-100' : 'bg-red-100'}`}>
                                    <Shield className={`w-8 h-8 ${sr.final_security_verdict === 'clear' ? 'text-green-600' : 'text-red-500'}`} />
                                </div>
                                <div className={`text-lg font-black uppercase ${sr.final_security_verdict === 'clear' ? 'text-green-700' : 'text-red-700'}`}>
                                    {(sr.final_security_verdict || 'CLEAR').replace('_', ' ').toUpperCase()}
                                </div>
                            </div>

                            {/* Violations */}
                            <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6">
                                <div className="text-xs font-black uppercase tracking-widest text-surface-400 mb-4">Violations</div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-surface-700">Tab Switches</span>
                                        <span className={`text-2xl font-black ${tabSwitches > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {tabSwitches}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-surface-700">Face Alerts</span>
                                        <span className={`text-2xl font-black ${faceAlerts > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                                            {faceAlerts}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Integrity score ring */}
                            <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6 flex flex-col items-center justify-center">
                                <div className="text-xs font-black uppercase tracking-widest text-surface-400 mb-4">Security Score</div>
                                <div className="relative">
                                    <ScoreRing score={integrityScore} size={80}
                                        color={integrityScore >= 80 ? '#22c55e' : integrityScore >= 50 ? '#f59e0b' : '#ef4444'} />
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-lg font-black text-surface-900">{integrityScore}</span>
                                        <span className="text-[10px] text-surface-400">/ 100</span>
                                    </div>
                                </div>
                                <p className="text-[11px] text-surface-500 text-center mt-3">
                                    Lower score = more violations detected
                                </p>
                            </div>
                        </div>

                        {/* Alert timeline */}
                        {sr.shield_alert_timeline?.length > 0 && (
                            <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6">
                                <h2 className="font-black text-surface-900 mb-4 flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-brand-600" />
                                    AI Shield — Event Timeline
                                </h2>
                                <div className="space-y-2">
                                    {sr.shield_alert_timeline.map((line: string, i: number) => (
                                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface-50 border border-surface-100 text-sm text-surface-800 font-medium">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 shrink-0" />
                                            {line}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Suspicious activities */}
                        <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6">
                            <h2 className="font-black text-surface-900 mb-4 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-brand-600" />
                                Suspicious Activities
                            </h2>
                            {sr.suspicious_activities?.length > 0 ? (
                                <div className="space-y-3">
                                    {sr.suspicious_activities.map((act: string, i: number) => (
                                        <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-100">
                                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                            <span className="text-sm text-red-800 font-medium">{act}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center py-12 text-surface-400 bg-green-50 rounded-2xl border border-green-100">
                                    <CheckCircle className="w-10 h-10 mb-2 text-green-400" />
                                    <p className="font-black text-green-700 text-sm">No suspicious behaviour detected</p>
                                    <p className="text-xs text-green-600 mt-1">Candidate maintained full focus throughout the session</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ════════════════════ TRANSCRIPT TAB ════════════════════ */}
                {activeTab === 'transcript' && (() => {
                    // Group turns by round
                    const rounds = Object.keys(ROUND_META)
                    type Group = { round: string; turns: any[] }
                    const groups: Group[] = []
                    let filteredTurns = transcript
                    if (transcriptSearch.trim()) {
                        filteredTurns = transcript.filter(t =>
                            (t.text || '').toLowerCase().includes(transcriptSearch.toLowerCase())
                        )
                    }
                    filteredTurns.forEach(turn => {
                        const r = (turn.round || 'intro').toLowerCase()
                        const last = groups[groups.length - 1]
                        if (!last || last.round !== r) groups.push({ round: r, turns: [turn] })
                        else last.turns.push(turn)
                    })

                    return (
                        <div className="space-y-4">
                            {/* Header */}
                            <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
                                            <MessageSquare className="w-4 h-4 text-brand-600" />
                                        </div>
                                        <div>
                                            <h2 className="font-black text-surface-900">Interview Transcript</h2>
                                            <p className="text-xs text-surface-400 font-medium mt-0.5">
                                                {transcript.length} total turns · {candidateName} × {jobTitle}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Search */}
                                    <div className="sm:ml-auto flex items-center gap-2 bg-surface-50 border border-surface-200 rounded-xl px-3 py-2">
                                        <Search className="w-3.5 h-3.5 text-surface-400 shrink-0" />
                                        <input
                                            value={transcriptSearch}
                                            onChange={e => setTranscriptSearch(e.target.value)}
                                            placeholder="Search transcript…"
                                            className="bg-transparent text-sm text-surface-700 placeholder:text-surface-400 focus:outline-none w-44"
                                        />
                                    </div>
                                </div>
                                {/* Round pills */}
                                <div className="flex flex-wrap gap-2 mt-4">
                                    {Object.entries(ROUND_META).map(([key, meta]) => {
                                        const count = transcript.filter(t => (t.round || '').toLowerCase() === key).length
                                        return (
                                            <span key={key} className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${meta.bg} ${meta.border}`}
                                                style={{ color: meta.color }}>
                                                {meta.icon} {meta.label}
                                                <span className="opacity-60">·</span>
                                                <span className="opacity-70">{count} turns</span>
                                            </span>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Loading / Error */}
                            {transcriptLoading && (
                                <div className="flex items-center justify-center gap-3 py-16 bg-white rounded-2xl border border-surface-100">
                                    <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                                    <span className="text-sm font-semibold text-surface-500">Loading transcript…</span>
                                </div>
                            )}
                            {transcriptError && (
                                <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-2xl">
                                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                                    <span className="text-sm text-red-700 font-medium">{transcriptError}</span>
                                    <button onClick={() => { setTranscript([]); fetchTranscript() }}
                                        className="ml-auto text-xs font-bold text-red-600 hover:underline">Retry</button>
                                </div>
                            )}

                            {/* Conversation grouped by round */}
                            {!transcriptLoading && !transcriptError && groups.length === 0 && (
                                <div className="flex flex-col items-center py-16 bg-white rounded-2xl border border-surface-100 text-surface-400">
                                    <MessageSquare className="w-10 h-10 mb-3 text-surface-200" />
                                    <p className="font-bold text-surface-500 text-sm">
                                        {transcriptSearch ? 'No results found' : 'No transcript available'}
                                    </p>
                                    <p className="text-xs mt-1">
                                        {transcriptSearch ? 'Try a different search term' : 'The interview may have ended before any turns were recorded'}
                                    </p>
                                </div>
                            )}

                            {!transcriptLoading && groups.map((group, gi) => {
                                const meta = ROUND_META[group.round] || ROUND_META.intro
                                return (
                                    <div key={gi} className="bg-white rounded-2xl border border-surface-100 shadow-card overflow-hidden">
                                        {/* Round header */}
                                        <div className={`flex items-center gap-2.5 px-5 py-3 border-b ${meta.bg} ${meta.border}`}>
                                            <span className="text-base">{meta.icon}</span>
                                            <span className="text-xs font-black uppercase tracking-widest" style={{ color: meta.color }}>
                                                {meta.label} Round
                                            </span>
                                            <span className="ml-auto text-[10px] font-bold text-surface-400">
                                                {group.turns.length} turn{group.turns.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>

                                        {/* Turns */}
                                        <div className="p-5 space-y-4">
                                            {group.turns.map((turn, ti) => {
                                                const isAI = turn.speaker === 'ai'
                                                const ts = turn.timestamp
                                                    ? new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                    : ''
                                                return (
                                                    <div key={ti} className={`flex gap-3 ${ isAI ? '' : 'flex-row-reverse'}`}>
                                                        {/* Avatar */}
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-black
                                                            ${ isAI ? 'bg-gradient-to-br from-brand-500 to-accent-500' : 'bg-gradient-to-br from-surface-600 to-surface-800'}`}>
                                                            {isAI ? <Bot className="w-4 h-4" /> : candidateName.charAt(0).toUpperCase()}
                                                        </div>
                                                        {/* Bubble */}
                                                        <div className={`max-w-[75%] ${ isAI ? '' : 'items-end'} flex flex-col gap-1`}>
                                                            <div className={`flex items-center gap-2 ${ isAI ? '' : 'flex-row-reverse'}`}>
                                                                <span className="text-[11px] font-black text-surface-600">
                                                                    {isAI ? 'HireAI' : candidateName}
                                                                </span>
                                                                {ts && <span className="text-[10px] text-surface-300 font-medium">{ts}</span>}
                                                            </div>
                                                            <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed font-medium
                                                                ${ isAI
                                                                    ? 'bg-surface-50 border border-surface-100 text-surface-800 rounded-tl-sm'
                                                                    : 'text-white rounded-tr-sm'}
                                                            `} style={!isAI ? { background: meta.color } : {}}>
                                                                {transcriptSearch
                                                                    ? turn.text.replace(
                                                                        new RegExp(`(${transcriptSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                                                                        (m: string) => `__MARK__${m}__ENDMARK__`
                                                                      ).split('__MARK__').map((part: string, pi: number) => {
                                                                        if (part.includes('__ENDMARK__')) {
                                                                            const [highlight, rest] = part.split('__ENDMARK__')
                                                                            return <span key={pi}><mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{highlight}</mark>{rest}</span>
                                                                        }
                                                                        return <span key={pi}>{part}</span>
                                                                      })
                                                                    : turn.text
                                                                }
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )
                })()}
            </div>
        </div>
    )
}
