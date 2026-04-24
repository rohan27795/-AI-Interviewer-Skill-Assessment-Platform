'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Search, Filter, ChevronDown, Eye, Video, Download, Star, TrendingUp, Users, Brain, FileText, Loader2 } from 'lucide-react'
import { applicationsApi, analyticsApi } from '@/services/api'
import { Suspense } from 'react'

const statusConfig: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  shortlisted:  { label: 'Shortlisted',  dot: 'bg-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-700'   },
  interviewed:  { label: 'Interviewed',  dot: 'bg-purple-400', bg: 'bg-purple-50', text: 'text-purple-700' },
  'in-review':  { label: 'In Review',    dot: 'bg-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-700'  },
  offer:        { label: 'Offer Sent',   dot: 'bg-green-400',  bg: 'bg-green-50',  text: 'text-green-700'  },
  rejected:     { label: 'Rejected',     dot: 'bg-red-400',    bg: 'bg-red-50',    text: 'text-red-700'    },
  scheduled:    { label: 'Scheduled',    dot: 'bg-indigo-400', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  invited:      { label: 'Invited',      dot: 'bg-sky-400',    bg: 'bg-sky-50',    text: 'text-sky-700'    },
  applied:      { label: 'Applied',      dot: 'bg-slate-400',  bg: 'bg-slate-50',  text: 'text-slate-700'  },
}

const scoreColor = (s: number) => s >= 85 ? 'text-green-600' : s >= 70 ? 'text-amber-600' : s > 0 ? 'text-red-500' : 'text-surface-300'

function CandidatesContent() {
  const searchParams = useSearchParams()
  const jobIdParam = searchParams.get('job_id')
  const jobTitleParam = searchParams.get('job_title')

  const [search, setSearch] = useState(jobTitleParam || '')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('score')
  
  const [activeTab, setActiveTab] = useState<'applications' | 'pool'>('applications')
  const [talentPool, setTalentPool] = useState<any[]>([])
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        const data: any = await applicationsApi.list()
        
        const mapped = data.map((d: any) => {
           const name = d.candidate_name || d.parsed_data?.name || d.users?.email || 'Unknown'
           const avatar = name.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase() || 'U'
           const rawScore = d.ai_score ?? 0
           let score = rawScore < 1 && rawScore > 0 ? Math.round(rawScore * 100 * 10) / 10 : Math.round(rawScore * 10) / 10
           return {
             id: d.id,
             name: name,
             email: d.parsed_data?.email || d.users?.email || 'Unknown',
             role: d.jobs?.title || 'Unknown Role',
             score: score,
             matchScore: score,
             status: d.status || 'applied',
             interviewed: ['interviewing', 'interviewed', 'offered', 'hired'].includes(d.status),
             avatar: avatar,
             location: d.jobs?.location || 'Remote',
             exp: d.parsed_data?.total_years_experience ? `${d.parsed_data.total_years_experience} yrs` : '0 yrs',
             appliedAt: d.created_at ? new Date(d.created_at).toLocaleDateString() : 'Just now'
           }
        })
        setCandidates(mapped)
      } catch (err) {
        console.error('Failed to fetch applications', err)
      } finally {
        setLoading(false)
      }
    }
    fetchCandidates()

    // Fetch talent pool separately
    const fetchTalentPool = async () => {
      try {
        const pool: any = await analyticsApi.getTalentPool()
        setTalentPool(pool || [])
      } catch (err) {
        console.error('Failed to fetch talent pool', err)
      }
    }
    fetchTalentPool()
  }, [])

  const filtered = candidates
    .filter(c => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.role.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase())
      const matchStatus = statusFilter === 'all' || c.status === statusFilter
      return matchSearch && matchStatus
    })
    .sort((a, b) => sortBy === 'score' ? b.score - a.score : sortBy === 'match' ? b.matchScore - a.matchScore : 0)

  const statuses = ['all', ...Object.keys(statusConfig)]

  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'Role', 'Status', 'Match Score', 'Interview Score', 'Location', 'Experience', 'Applied']
    
    const csvContent = [
      headers.join(','),
      ...filtered.map(c => [
        `"${c.name}"`, 
        `"${c.email}"`, 
        `"${c.role}"`, 
        `"${statusConfig[c.status]?.label || c.status}"`, 
        `"${c.matchScore}%"`, 
        `"${c.score > 0 ? c.score : 'Pending'}"`,
        `"${c.location}"`,
        `"${c.exp}"`,
        `"${c.appliedAt}"`
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'candidates_export.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) return (
    <div className="p-10 text-center flex flex-col items-center gap-4 h-[60vh] justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand-600" /> 
      <p className="text-surface-500 font-medium tracking-wide">Loading candidates...</p>
    </div>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold font-display text-surface-900">All Candidates</h1>
          <p className="text-surface-700 font-medium mt-1">{filtered.length} candidates across all positions</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 text-sm font-semibold text-surface-700 glass-btn hover:bg-white/40 px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Applied', value: candidates.length, color: 'bg-surface-100 text-surface-700' },
          { label: 'Interviewed', value: candidates.filter(c => ['interviewing', 'interviewed', 'offered', 'hired'].includes(c.status)).length, color: 'bg-purple-100 text-purple-700' },
          { label: 'Shortlisted', value: candidates.filter(c => ['invited', 'scheduled', 'interviewing', 'interviewed', 'offered', 'hired'].includes(c.status)).length, color: 'bg-blue-100 text-blue-700' },
          { label: 'Offers Sent', value: candidates.filter(c => ['offered', 'hired'].includes(c.status)).length, color: 'bg-green-100 text-green-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.color} text-center`}>
            <div className="text-2xl font-bold font-display">{s.value}</div>
            <div className="text-xs font-semibold mt-0.5 opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex bg-surface-100 rounded-2xl p-1 mb-6 max-w-sm">
        <button onClick={() => setActiveTab('applications')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'applications' ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
          Active Applications
        </button>
        <button onClick={() => setActiveTab('pool')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'pool' ? 'bg-white text-brand-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'} flex items-center justify-center gap-1.5`}>
          <Brain className="w-4 h-4" /> Active Talent Pool ({talentPool.length})
        </button>
      </div>

      {activeTab === 'applications' ? (
        <>
          {/* Filters */}
      <div className="glass-card mb-6 p-1">
        <div className="flex flex-col sm:flex-row gap-3 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, role, email..."
              className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-surface-900 font-medium placeholder:text-surface-600 focus:outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-surface-700 font-bold uppercase tracking-wider whitespace-nowrap">Sort by:</span>
            <select
              value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="glass-input text-sm font-semibold text-surface-800 rounded-xl px-3 py-2.5 focus:outline-none cursor-pointer"
            >
              <option value="score">Interview Score</option>
              <option value="match">Match Score</option>
              <option value="date">Applied Date</option>
            </select>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          {statuses.slice(0, 7).map(s => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              }`}>
              {s === 'all' ? 'All Statuses' : statusConfig[s]?.label || s}
              {s === 'all' ? ` (${candidates.length})` : ` (${candidates.filter(c => c.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Candidates Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full data-table">
          <thead>
            <tr>
              <th className="text-left">Candidate</th>
              <th className="text-left hidden md:table-cell">Position</th>
              <th className="text-center">Match</th>
              <th className="text-center">Score</th>
              <th className="text-left hidden sm:table-cell">Status</th>
              <th className="text-left hidden lg:table-cell">Applied</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const st = statusConfig[c.status] || { label: c.status, dot: 'bg-gray-400', bg: 'bg-gray-50', text: 'text-gray-700' }
              return (
                <tr key={c.id} className="group hover:bg-surface-50 transition-colors">
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-accent-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {c.avatar}
                      </div>
                      <div>
                        <div className="font-semibold text-surface-900 text-sm">{c.name}</div>
                        <div className="text-xs text-surface-600 font-medium">{c.location} · {c.exp}</div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden md:table-cell">
                    <span className="text-sm text-surface-700 font-medium">{c.role}</span>
                  </td>
                  <td className="text-center">
                    <span className={`text-sm font-bold ${scoreColor(c.matchScore)}`}>{c.matchScore}%</span>
                  </td>
                  <td className="text-center">
                    {c.score > 0 ? (
                      <span className={`text-sm font-bold ${scoreColor(c.score)}`}>{c.score}</span>
                    ) : (
                      <span className="text-xs text-surface-300 italic">Pending</span>
                    )}
                  </td>
                  <td className="hidden sm:table-cell">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full ${st.bg} ${st.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                  </td>
                  <td className="hidden lg:table-cell text-xs text-surface-600 font-medium">{c.appliedAt}</td>
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      {c.interviewed && (
                        <Link href={`/recruiter/assessments`}
                          className="flex items-center gap-1 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 px-2.5 py-1.5 rounded-lg transition-colors">
                          <Eye className="w-3.5 h-3.5" /> Report
                        </Link>
                      )}
                      {!c.interviewed && c.status === 'scheduled' && (
                        <Link href={`/candidate/room/${c.id}`}
                          className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-2.5 py-1.5 rounded-lg transition-colors">
                          <Video className="w-3.5 h-3.5" /> Join
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-surface-500">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No candidates found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        )}
      </div>
      </>
      ) : (
        <div className="glass-card p-6">
          <div className="mb-6 flex items-center gap-3 bg-brand-50/50 backdrop-blur-md border border-brand-100/50 p-4 rounded-xl">
            <Brain className="w-8 h-8 text-brand-600" />
            <div>
              <h3 className="font-bold text-brand-900 text-sm">Passive Talent Pool</h3>
              <p className="text-xs text-brand-700">Candidates with active profiles who haven't applied to your jobs yet — ready to be proactively sourced.</p>
            </div>
          </div>
          
          {talentPool.length === 0 ? (
            <div className="text-center py-16 text-surface-500">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No passive candidates found</p>
              <p className="text-sm mt-1 text-surface-400">Candidates who create profiles but haven't applied will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {talentPool.map((p: any) => (
                <div key={p.id}
                  className="glass-card p-4 flex flex-col gap-3 hover:scale-[1.01] transition-transform"
                  style={{ border: '1px solid rgba(99,102,241,0.15)' }}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #6366f1 0%, #d946ef 100%)' }}>
                      {p.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-surface-900 text-sm truncate">{p.name}</div>
                      <div className="text-xs text-surface-500 font-medium">{p.experience_years} yrs exp</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      p.match_indicator === 'high' ? 'bg-green-100 text-green-700' :
                      p.match_indicator === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {p.match_indicator === 'high' ? 'Senior' : p.match_indicator === 'medium' ? 'Mid' : 'Entry'}
                    </span>
                  </div>

                  {/* Headline */}
                  {p.headline && (
                    <p className="text-xs text-surface-600 line-clamp-2 leading-relaxed">{p.headline}</p>
                  )}

                  {/* Skills */}
                  {p.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.skills.slice(0, 5).map((s: string) => (
                        <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                          {s}
                        </span>
                      ))}
                      {p.skills.length > 5 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-100 text-surface-500">+{p.skills.length - 5}</span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto pt-1">
                    {p.resume_url && (
                      <a href={p.resume_url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-surface-700 bg-surface-100 hover:bg-surface-200 px-3 py-2 rounded-lg transition-colors">
                        <FileText className="w-3.5 h-3.5" /> Resume
                      </a>
                    )}
                    <button
                      className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg transition-colors">
                      <Star className="w-3.5 h-3.5" /> Invite
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function CandidatesPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center flex flex-col items-center gap-4"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /> Loading candidates...</div>}>
      <CandidatesContent />
    </Suspense>
  )
}
