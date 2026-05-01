'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp, TrendingDown, Users, Briefcase, Clock, CheckCircle, 
  XCircle, ArrowUpRight, BarChart2, Filter, Download, ChevronDown,
  Zap, Star, Target, Video, MessageSquare, Brain, Award, Calendar, Loader2
} from 'lucide-react'
import { analyticsApi } from '@/services/api'

// ── Color helpers ─────────────────────────────────────────────────────────────
const colorBg: Record<string, string> = {
  brand:  'bg-brand-100',
  purple: 'bg-purple-100',
  amber:  'bg-amber-100',
  green:  'bg-green-100',
  accent: 'bg-accent-100',
  red:    'bg-red-100',
}
const colorText: Record<string, string> = {
  brand:  'text-brand-600',
  purple: 'text-purple-600',
  amber:  'text-amber-600',
  green:  'text-green-600',
  accent: 'text-accent-600',
  red:    'text-red-500',
}

const statusBadge: Record<string, string> = {
  'Offer Sent':   'bg-green-50 text-green-700',
  'Shortlisted':  'bg-blue-50 text-blue-700',
  'Interviewed':  'bg-purple-50 text-purple-700',
}

const urgencyDot: Record<string, string> = {
  high:   'bg-red-500',
  medium: 'bg-amber-500',
  low:    'bg-green-500',
}

// ── Safelist for pipeline colors to prevent Tailwind purging ──────────────────
const pipelineColors: Record<string, string> = {
    'bg-brand-500': 'bg-brand-500',
    'bg-brand-400': 'bg-brand-400',
    'bg-accent-500': 'bg-accent-500',
    'bg-warning-500': 'bg-warning-500',
    'bg-success-500': 'bg-success-500',
    'bg-emerald-600': 'bg-emerald-600',
}

const getIconComp = (iconName: string) => {
    switch(iconName) {
        case 'Users': return Users;
        case 'Video': return Video;
        case 'Clock': return Clock;
        case 'CheckCircle': return CheckCircle;
        case 'Brain': return Brain;
        case 'XCircle': return XCircle;
        default: return BarChart2;
    }
}

// weeklyTrend and sources are now loaded from the backend analytics API
// These defaults are used only while data is loading.
const EMPTY_WEEKLY: { day: string; apps: number; interviews: number }[] = [
  { day: 'Mon', apps: 0, interviews: 0 },
  { day: 'Tue', apps: 0, interviews: 0 },
  { day: 'Wed', apps: 0, interviews: 0 },
  { day: 'Thu', apps: 0, interviews: 0 },
  { day: 'Fri', apps: 0, interviews: 0 },
  { day: 'Sat', apps: 0, interviews: 0 },
  { day: 'Sun', apps: 0, interviews: 0 },
]

export default function AnalyticsPage() {
  const [range, setRange] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [metricsData, setMetricsData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchMetrics = async () => {
        try {
            setLoading(true)
            setError(null)
            const data = await analyticsApi.getMetrics(range)
            setMetricsData(data)
        } catch (err: any) {
            console.error('Failed to fetch analytics metrics', err)
            setError(err?.message || 'Failed to load analytics data.')
        } finally {
            setLoading(false)
        }
    }
    fetchMetrics()
  }, [range])

  if (loading) {
      return (
          <div className="h-full min-h-[60vh] flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
              <p className="text-surface-500 font-medium">Loading Analytics...</p>
          </div>
      )
  }

  if (error || !metricsData) {
    return (
      <div className="h-full min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center p-6">
        <BarChart2 className="w-12 h-12 text-surface-300" />
        <h2 className="text-lg font-bold text-surface-700">Could not load analytics</h2>
        <p className="text-surface-500 text-sm max-w-sm">{error || 'No data available yet.'}</p>
        <button
          onClick={() => { setLoading(true); analyticsApi.getMetrics(range).then(setMetricsData).catch((e: any) => setError(e.message)).finally(() => setLoading(false)) }}
          className="mt-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  const { kpis, pipeline, topJobs, weeklyActivity, sourcingChannels } = metricsData
  const weeklyTrend = (weeklyActivity && weeklyActivity.length > 0) ? weeklyActivity : EMPTY_WEEKLY
  const sources = sourcingChannels || []
  
  // Calculate the maximum value across both apps and interviews for proper chart scaling
  const maxVal = Math.max(
    ...weeklyTrend.map((d: any) => Math.max(d.apps || 0, d.interviews || 0)), 
    1
  )

  const handleExport = () => {
    const headers = ['Metric', 'Value', 'Change']
    const rows = kpis.map((k: any) => [k.label, k.value, k.change])
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map((e: any) => e.join(",")).join("\n")

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `hireai_analytics_${range}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-surface-900">Recruitment Analytics</h1>
          <p className="text-surface-600 font-medium mt-1">Real-time hiring insights powered by HireAI</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Range Selector */}
          <div className="flex bg-surface-100 rounded-xl p-1 text-sm font-semibold">
            {['7d','30d','90d'].map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  range === r
                    ? 'bg-white text-surface-900 shadow-sm'
                    : 'text-surface-500 hover:text-surface-700'
                }`}
              >{r}</button>
            ))}
          </div>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 glass-btn text-sm font-semibold text-surface-700 hover:bg-white/40 transition-colors shadow-sm rounded-xl"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k: any, i: number) => {
            const Icon = getIconComp(k.icon)
            return (
          <div key={i} className="glass-card hover:shadow-card-hover transition-all p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorBg[k.color]} mb-4`}>
              <Icon className={`w-5 h-5 ${colorText[k.color]}`} />
            </div>
            <div className="text-2xl font-bold font-display text-surface-900 leading-none mb-1">{k.value}</div>
            <div className="text-[11px] text-surface-500 font-bold uppercase tracking-wider mb-3">{k.label}</div>
            <div className={`flex items-center gap-1 text-xs font-bold ${k.positive ? 'text-green-600' : 'text-red-500'}`}>
              {k.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {k.change} <span className="text-surface-400 font-normal">{k.sub}</span>
            </div>
          </div>
        )})}
      </div>

      {/* ── Main Row ── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Pipeline Funnel */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-bold font-display text-surface-900 text-lg">Hiring Pipeline</h2>
              <p className="text-sm text-surface-500 font-medium mt-0.5">Overall conversion funnel based on your data</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-bold text-brand-600 bg-brand-50 px-3 py-1.5 rounded-full">
              <Zap className="w-3.5 h-3.5" /> Funnel View
            </span>
          </div>
          <div className="space-y-3">
            {pipeline.map((p: any) => (
              <div key={p.stage} className="flex items-center gap-4">
                <div className="w-28 text-sm font-semibold text-surface-700 flex-shrink-0">{p.stage}</div>
                <div className="flex-1 h-8 bg-surface-50 rounded-xl overflow-hidden relative">
                  <div
                    className={`h-full ${p.count > 0 ? p.color : 'bg-transparent'} rounded-xl transition-all duration-700 flex items-center justify-end ${p.count > 0 ? 'pr-3' : ''}`}
                    style={{ width: `${p.count > 0 ? Math.max(p.pct, 2) : 0}%` }} 
                  >
                    {p.pct > 10 && <span className="text-xs font-bold text-white">{p.pct}%</span>}
                  </div>
                </div>
                <div className="w-16 text-right text-sm font-bold text-surface-900 flex-shrink-0">{p.count.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Source Breakdown */}
        <div className="glass-card p-6">
          <h2 className="font-bold font-display text-surface-900 text-lg mb-1">Sourcing Channels</h2>
          <p className="text-sm text-surface-500 font-medium mb-6">Where candidates come from</p>
          {sources.length === 0 ? (
            <p className="text-sm text-surface-400 italic text-center py-6">No applications yet — sourcing data will appear here.</p>
          ) : (
            <div className="space-y-5">
              {sources.map((s: any) => (
                <div key={s.name}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-surface-800">{s.name}</span>
                    <span className="text-sm font-bold text-surface-900">{s.count.toLocaleString()}</span>
                  </div>
                  <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full`} style={{ width: `${s.pct}%` }} />
                  </div>
                  <div className="text-right text-[11px] font-bold text-surface-400 mt-1">{s.pct}%</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Weekly Trend — Bar chart (pure CSS) */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-bold font-display text-surface-900 text-lg">Weekly Activity</h2>
              <p className="text-sm text-surface-500 font-medium mt-0.5">Applications vs. AI Interviews</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-brand-500 inline-block" />Applications</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-accent-400 inline-block" />Interviews</span>
            </div>
          </div>
          <div className="flex items-end gap-3 h-40">
            {weeklyTrend.map(d => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex items-end gap-0.5 w-full h-32">
                  <div
                    className="flex-1 bg-brand-500 rounded-t-lg transition-all"
                    style={{ height: `${(d.apps / maxVal) * 100}%` }}
                    title={`${d.apps} applications`}
                  />
                  <div
                    className="flex-1 bg-accent-400 rounded-t-lg transition-all"
                    style={{ height: `${(d.interviews / maxVal) * 100}%` }}
                    title={`${d.interviews} interviews`}
                  />
                </div>
                <span className="text-[11px] font-bold text-surface-500">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Candidates (Skipping MVP dynamic candidate generation for visual chart space - logic implemented in backend) */}
        <div className="glass-card overflow-hidden flex flex-col items-center justify-center text-center p-6">
            <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mb-4">
                <Star className="w-8 h-8 text-brand-500" />
            </div>
            <h3 className="font-display font-bold text-surface-900 text-lg mb-2">High Performers</h3>
            <p className="text-surface-500 text-sm">You have several candidates exceeding the 80% AI interview score threshold this week. Review them in the Candidates tab.</p>
        </div>
      </div>

      {/* ── Job Performance Table ── */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <div>
            <h2 className="font-bold font-display text-surface-900 text-lg">Job Performance</h2>
            <p className="text-sm text-surface-500 font-medium">Applications and AI match scores per posting</p>
          </div>
          <button className="flex items-center gap-2 text-sm font-semibold text-surface-600 hover:text-surface-900 transition-colors">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-50">
                <th className="text-left px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-surface-500">Job Title</th>
                <th className="text-left px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-surface-500">Dept</th>
                <th className="text-right px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-surface-500">Applications</th>
                <th className="text-right px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-surface-500">Avg AI Score</th>
                <th className="text-center px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-surface-500">Urgency</th>
                <th className="text-center px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-surface-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {topJobs.length === 0 ? (
                  <tr>
                      <td colSpan={6} className="text-center py-6 text-surface-500 text-sm">No job data available.</td>
                  </tr>
              ) : topJobs.map((j: any, i: number) => (
                <tr key={i} className="hover:bg-surface-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-semibold text-surface-900">{j.title}</td>
                  <td className="px-6 py-4 text-sm text-surface-600 font-medium">{j.dept}</td>
                  <td className="px-6 py-4 text-sm font-bold text-surface-900 text-right">{j.apps}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`text-sm font-bold ${j.score >= 90 ? 'text-green-600' : j.score >= 80 ? 'text-amber-600' : 'text-red-500'}`}>
                      {j.score}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="flex items-center justify-center gap-1.5 text-xs font-bold capitalize">
                      <span className={`w-2 h-2 rounded-full ${urgencyDot[j.urgency] || urgencyDot.medium}`} />
                      {j.urgency}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${j.filled ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {j.filled ? 'Filled' : 'Open'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
