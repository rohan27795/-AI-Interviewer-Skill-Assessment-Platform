'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Plus, Search, Filter, MapPin, Users, Clock,
  MoreVertical, Edit, Trash2, Eye, Briefcase,
  ChevronDown, ArrowUpRight, Zap, Share2, Linkedin, Sparkles, Globe, Video
} from 'lucide-react'
import { getApiUrl } from '@/lib/api'

const urgencyConfig = {
  high: 'bg-red-50 text-red-600 border-red-200',
  medium: 'bg-amber-50 text-amber-600 border-amber-200',
  low: 'bg-green-50 text-green-600 border-green-200',
}

export default function JobsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [localJobs, setLocalJobs] = useState<any[]>([])
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const token = localStorage.getItem('hireai_token')
        const API_URL = getApiUrl();
        const response = await fetch(`${API_URL}/api/v1/jobs/?is_active=true`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        })
        const data = await response.json()

        const mappedJobs = data.map((j: any) => {
          return {
            id: j.id,
            title: j.title,
            department: j.department || 'General',
            location: j.location || 'Remote',
            type: (j.job_type || 'full_time').replace('_', '-').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            salary: j.salary_min && j.salary_max ? `₹${j.salary_min}-${j.salary_max} LPA` : 'Not specified',
            applications: j.applications_count || 0,
            shortlisted: j.shortlisted_count || 0,
            interviewed: j.interviewed_count || 0,
            status: j.status || 'active',
            posted: j.created_at ? new Date(j.created_at).toLocaleDateString() : 'Just now',
            tags: (j.requirements && j.requirements.length > 0) ? j.requirements : [],
            urgency: j.urgency || 'medium',
          }
        })

        setLocalJobs(mappedJobs)
      } catch (err: any) {
        console.error(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchJobs()
  }, [])

  const filtered = localJobs.filter((j: any) => {
    const matchSearch = j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.department.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || j.status === statusFilter
    return matchSearch && matchStatus
  })

  const deleteJob = async (id: string) => {
    const token = localStorage.getItem('hireai_token')
    if (!token) return toast.error('Auth required')

    try {
      const API_URL = getApiUrl();
      const response = await fetch(`${API_URL}/api/v1/jobs/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('Delete failed')

      setLocalJobs(prev => prev.filter(j => j.id !== id))
      toast.success('Job deleted')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setOpenDropdownId(null)
    }
  }

  const handleShare = (job: any, platform: 'linkedin' | 'whatsapp' | 'email') => {
    const jobUrl = `${window.location.origin}/candidate/jobs?id=${job.id}`
    const text = `🚀 We're hiring: ${job.title}\n📍 ${job.location} | ${job.type}\n💼 ${job.salary}\n\nApply via HireAI — AI-powered interviews, instant results.`

    let url = ''
    if (platform === 'linkedin') {
      // Use the feed endpoint because share-offsite no longer accepts custom text parameters
      // and cannot scrape localhost URLs for OpenGraph tags.
      const shareText = encodeURIComponent(text + '\n\n👉 Apply here: ' + jobUrl)
      url = `https://www.linkedin.com/feed/?shareActive=true&text=${shareText}`

      // Open in a centered popup so LinkedIn can do its OAuth handshake correctly
      const w = 600, h = 650
      const left = Math.max(0, (window.screen.width - w) / 2)
      const top = Math.max(0, (window.screen.height - h) / 2)
      window.open(url, 'linkedin-share', `width=${w},height=${h},left=${left},top=${top},toolbar=0,menubar=0,scrollbars=1`)
      setOpenDropdownId(null)
      return
    } else if (platform === 'whatsapp') {
      url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text + '\n\n👉 Apply here: ' + jobUrl)}`
    } else if (platform === 'email') {
      const subject = `We're Hiring: ${job.title} — HireAI`
      const body = `${text}\n\nApply here: ${jobUrl}`
      url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    } else if (platform === 'naukri' as any) {
      url = `https://www.naukri.com/recruit/login`
      toast.success('Copied JD to clipboard for Naukri!')
      navigator.clipboard.writeText(text + '\n\nApply: ' + jobUrl)
    } else if (platform === 'indeed' as any) {
      url = `https://www.indeed.com/hire`
      toast.success('Copied JD to clipboard for Indeed!')
      navigator.clipboard.writeText(text + '\n\nApply: ' + jobUrl)
    }

    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    setOpenDropdownId(null)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold font-display text-surface-900">Job Postings</h1>
          <p className="text-surface-700 font-medium mt-1">{filtered.length} active positions across departments</p>
        </div>
        <Link href="/recruiter/jobs/new"
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          Post New Job
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs..."
            className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-surface-900 placeholder:text-surface-600 font-medium focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          {['all', 'active', 'paused', 'closed'].map(s => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'glass-card hover:bg-white/40 text-surface-700'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Job Cards */}
      <div className="space-y-4">
        {filtered.map(job => (
          <div 
            key={job.id} 
            className={`glass-card transition-all p-6 relative group ${openDropdownId === job.id ? 'z-[60] overflow-visible' : 'z-10'}`}
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-400 to-accent-400 opacity-0 group-hover:opacity-100 transition-opacity rounded-t-[1.25rem]" />
            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
              {/* Left Side: Info & Tags */}
              <div className="flex-1">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0 border border-brand-100">
                    <Briefcase className="w-6 h-6 text-brand-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-surface-900 font-display text-xl mb-1">{job.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-surface-500 font-bold uppercase tracking-wider">
                      <span>{job.department}</span>
                      <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{job.location}</span>
                      <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{job.posted}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-1.5">
                  {job.tags.map((tag: any) => (
                    <span key={tag} className="text-[10px] bg-surface-50 text-surface-600 px-2.5 py-1 rounded-lg font-black uppercase tracking-widest border border-surface-100/50">{tag}</span>
                  ))}
                </div>
              </div>

              {/* Center: Recruitment Funnel */}
              <div className="flex gap-8 lg:px-8 lg:border-l lg:border-r border-surface-50">
                <Link 
                  href={`/recruiter/candidates?job_title=${encodeURIComponent(job.title)}&status=all`}
                  className="text-center group cursor-pointer"
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1 text-surface-400">
                    <Users className="w-3.5 h-3.5" />
                    <span className="text-[10px] text-surface-400 font-black uppercase tracking-widest mt-1">Applied</span>
                  </div>
                  <div className="text-2xl font-black font-display text-surface-900 group-hover:text-brand-600 transition-colors uppercase tracking-tight">
                    {job.applications}
                  </div>
                </Link>

                <Link 
                  href={`/recruiter/candidates?job_title=${encodeURIComponent(job.title)}&status=shortlisted`}
                  className="text-center group cursor-pointer"
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1 text-brand-600">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="text-[10px] text-brand-500/80 font-black uppercase tracking-widest mt-1">Shortlist</span>
                  </div>
                  <div className="text-2xl font-black font-display text-brand-600 group-hover:scale-110 transition-transform uppercase tracking-tight">
                    {job.shortlisted}
                  </div>
                </Link>

                <Link 
                  href={`/recruiter/candidates?job_title=${encodeURIComponent(job.title)}&status=interviewed`}
                  className="text-center group cursor-pointer"
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1 text-green-600">
                    <Video className="w-3.5 h-3.5" />
                    <span className="text-[10px] text-green-500/80 font-black uppercase tracking-widest mt-1">Interviews</span>
                  </div>
                  <div className="text-2xl font-black font-display text-green-600 group-hover:scale-110 transition-transform uppercase tracking-tight">
                    {job.interviewed}
                  </div>
                </Link>
              </div>

              {/* Right: Actions */}
              <div className="flex flex-col sm:flex-row items-center gap-3 lg:ml-auto">
                <Link href={`/recruiter/candidates?job_title=${encodeURIComponent(job.title)}`}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest text-white bg-brand-600 hover:bg-brand-700 px-6 py-3 rounded-xl transition-all shadow-card hover:shadow-card-hover active:scale-95">
                  <Users className="w-4 h-4" />
                  Manage
                </Link>
                
                <button 
                  onClick={() => handleShare(job, 'linkedin')}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest text-blue-600 bg-white border-2 border-blue-50 hover:border-blue-100 hover:bg-blue-50 px-5 py-3 rounded-xl transition-all shadow-sm">
                  <Linkedin className="w-4 h-4" />
                  Post
                </button>

                <div className="relative">
                  <button onClick={() => setOpenDropdownId(openDropdownId === job.id ? null : job.id)} className="w-12 h-12 rounded-xl border-2 border-surface-50 flex items-center justify-center hover:bg-surface-50 transition-all hover:border-surface-100">
                    <MoreVertical className="w-5 h-5 text-surface-400" />
                  </button>
                  {openDropdownId === job.id && (
                    <div className="absolute right-0 mt-3 w-64 bg-white border border-surface-100 rounded-2xl shadow-2xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="px-5 py-3 text-[10px] font-black text-surface-400 uppercase tracking-[0.2em] border-b border-surface-50 mb-1">Quick Actions</div>
                      <Link href={`/recruiter/jobs/${job.id}/edit`} onClick={() => setOpenDropdownId(null)} className="w-full text-left px-5 py-3 text-sm font-bold text-surface-700 hover:bg-surface-50 flex items-center gap-3 transition-colors"><Edit className="w-4 h-4 text-surface-400"/> Edit Job</Link>
                      <Link href={`/recruiter/jobs/${job.id}`} onClick={() => setOpenDropdownId(null)} className="w-full text-left px-5 py-3 text-sm font-bold text-surface-700 hover:bg-surface-50 flex items-center gap-3 transition-colors"><Eye className="w-4 h-4 text-surface-400"/> View Details</Link>
                      
                      <div className="px-5 py-3 mt-2 text-[10px] font-black text-surface-400 uppercase tracking-[0.2em] border-b border-surface-50 border-t mb-1 bg-surface-50/30">External Reach</div>
                      <button onClick={() => handleShare(job, 'linkedin')} className="w-full text-left px-5 py-3 text-sm font-black uppercase tracking-wider text-blue-600 hover:bg-blue-50 flex items-center gap-3 transition-colors">
                        <Linkedin className="w-4 h-4"/> LinkedIn Feed
                      </button>
                      <button onClick={() => handleShare(job, 'whatsapp')} className="w-full text-left px-5 py-3 text-sm font-black uppercase tracking-wider text-green-600 hover:bg-green-50 flex items-center gap-3 transition-colors">
                         <Share2 className="w-4 h-4"/> WhatsApp
                      </button>
                      <button onClick={() => handleShare(job, 'email')} className="w-full text-left px-5 py-3 text-sm font-black uppercase tracking-wider text-brand-600 hover:bg-brand-50 flex items-center gap-3 transition-colors">
                         <Zap className="w-4 h-4"/> Email Blast
                      </button>
                      <button onClick={() => handleShare(job, 'naukri' as any)} className="w-full text-left px-5 py-3 text-sm font-black uppercase tracking-wider text-surface-700 hover:bg-surface-50 flex items-center gap-3 transition-colors">
                         <Globe className="w-4 h-4"/> Naukri.com
                      </button>
                      <button onClick={() => handleShare(job, 'indeed' as any)} className="w-full text-left px-5 py-3 text-sm font-black uppercase tracking-wider text-surface-700 hover:bg-surface-50 flex items-center gap-3 transition-colors">
                         <Briefcase className="w-4 h-4"/> Indeed Hire
                      </button>

                      <div className="h-px bg-surface-50 my-2"></div>
                      <button onClick={() => deleteJob(job.id)} className="w-full text-left px-5 py-3 text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"><Trash2 className="w-4 h-4 text-red-400"/> Delete Listing</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Premium Industrial Footer */}
            <div className="mt-8 pt-5 border-t border-surface-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex-1 max-w-sm">
                <div className="flex items-center justify-between text-[11px] text-surface-400 font-black uppercase tracking-widest mb-2.5">
                  <span>Hiring Pipeline Efficiency</span>
                  <span className="text-brand-600">{job.applications > 0 ? Math.round((job.interviewed / job.applications) * 100) : 0}% Yield</span>
                </div>
                <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-700"
                       style={{ width: `${job.applications > 0 ? (job.shortlisted / job.applications) * 100 : 0}%` }} />
                </div>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[10px] font-black text-surface-300 uppercase tracking-widest mr-2">Distribution Status:</span>
                <div className="px-3 py-1.5 rounded-xl bg-blue-50/50 text-blue-600 text-[9px] font-black uppercase flex items-center gap-1.5 border border-blue-100/50" title="Ready for LinkedIn">
                  <Linkedin className="w-3 h-3" /> LinkedIn
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-brand-50/50 text-brand-600 text-[9px] font-black uppercase flex items-center gap-1.5 border border-brand-100/50" title="Google SEO Optimized">
                  <Sparkles className="w-3 h-3" /> Google SEO
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-surface-50 text-surface-500 text-[9px] font-black uppercase flex items-center gap-1.5 border border-surface-100/50" title="Naukri & Indeed Ready">
                  <Globe className="w-3 h-3" /> India Direct
                </div>
                <span className={`ml-3 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border-2 ${
                  job.urgency === 'high' ? 'bg-red-50/30 text-red-600 border-red-100/50' : 
                  job.urgency === 'medium' ? 'bg-amber-50/30 text-amber-600 border-amber-100/50' : 
                  'bg-green-50/30 text-green-600 border-green-100/50'
                }`}>
                  {job.status === 'active' ? '● Live' : '⏸ Paused'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
