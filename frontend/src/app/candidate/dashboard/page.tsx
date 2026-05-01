'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import axios from 'axios'
import { useDropzone } from 'react-dropzone'
import { 
  Upload, FileText, Brain, CheckCircle, 
  Briefcase, MapPin, Clock, 
  Loader2, Zap, AlertCircle, Globe, Sparkles
} from 'lucide-react'
import { getApiUrl } from '@/lib/api'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import AuthGuard from '@/components/AuthGuard'

function CandidateDashboardInner() {
  const { token, logout, getInitials } = useAuth()
  const [profile, setProfile] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editForm, setEditForm] = useState({ full_name: '', headline: '' })
  const [saving, setSaving] = useState(false)
  const [applications, setApplications] = useState<any[]>([])

  const fetchDashboardData = async () => {
    try {
      if (!token) return
      setLoading(true)

      const API_URL = getApiUrl()
      // Fetch Profile
      const profRes = await axios.get(`${API_URL}/api/v1/profiles/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setProfile(profRes.data)

      // Fetch Active Jobs
      const jobsRes = await axios.get(`${API_URL}/api/v1/jobs/?is_active=true`)
      setJobs(jobsRes.data)

      // Fetch My Applications to get official AI scores
      const appsRes = await axios.get(`${API_URL}/api/v1/applications/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setApplications(appsRes.data)

    } catch (err: any) {
      console.error('Dashboard Fetch Error:', err)
      // If it's a 401, then the token is truly dead
      if (err.response?.status === 401) {
        toast.error('Session expired. Please log in again.')
        logout()
      } else {
        toast.error('Failed to load some dashboard data. Please try refreshing.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) fetchDashboardData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return
    const file = accepted[0]
    
    setUploading(true)
    const toastId = toast.loading('Uploading and parsing resume with AI...')
    
    try {
      const API_URL = getApiUrl()
      const formData = new FormData()
      formData.append('resume', file)
      
      const res = await axios.post(`${API_URL}/api/v1/profiles/me/resume`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      })
      
      setProfile(res.data)
      toast.success('Resume parsed successfully! Insights updated.', { id: toastId })
    } catch (err) {
      console.error(err)
      toast.error('Failed to upload resume', { id: toastId })
    } finally {
      setUploading(false)
    }
  }, [token])

  const handleEditProfile = () => {
    setEditForm({
      full_name: profile?.full_name || '',
      headline: profile?.headline || ''
    })
    setIsEditModalOpen(true)
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const API_URL = getApiUrl()
      const res = await axios.put(`${API_URL}/api/v1/profiles/me`, editForm, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setProfile(res.data)
      setIsEditModalOpen(false)
      toast.success('Profile updated successfully!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to update profile.')
    } finally {
      setSaving(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
  })

  const handleDeleteResume = async () => {
    if (!confirm('Are you sure you want to delete your global resume and AI insights?')) return
    
    setUploading(true)
    const toastId = toast.loading('Deleting resume...')
    
    try {
      const API_URL = getApiUrl()
      const res = await axios.delete(`${API_URL}/api/v1/profiles/me/resume`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setProfile(res.data)
      toast.success('Resume and insights removed.', { id: toastId })
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete resume.', { id: toastId })
    } finally {
      setUploading(false)
    }
  }

  // logout() from useAuth handles clearing storage + redirect to /auth/login

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin mb-4" />
        <p className="text-surface-500 font-medium animate-pulse">Loading your dashboard...</p>
      </div>
    )
  }

  // Find recommended jobs based on matching skills
  const mySkills = profile?.skills?.map((s: string) => s.toLowerCase()) || []
  const recommendedJobs = jobs.map(job => {
    // Check if user has already applied to this job
    const existingApp = applications.find(app => (app.job_id === job.id || app.jobs?.id === job.id))
    
    if (existingApp && existingApp.ai_score !== undefined && existingApp.ai_score !== null) {
      // Use official AI score from the backend
      return { 
        ...job, 
        matchPercentage: Math.round(existingApp.ai_score * 100),
        isOfficialScore: true,
        hasApplied: true
      }
    }

    // Fallback to skill-overlap heuristic (Estimated Match)
    const jobSkills = job.requirements?.map((s: string) => s.toLowerCase()) || []
    const matchCount = jobSkills.filter((s: string) => mySkills.includes(s)).length
    const matchPercentage = jobSkills.length > 0 ? Math.round((matchCount / jobSkills.length) * 100) : 0
    return { ...job, matchPercentage, isOfficialScore: false, hasApplied: false }
  }).filter(j => j.matchPercentage > 20).sort((a, b) => b.matchPercentage - a.matchPercentage)

  return (
    <div className="min-h-screen bg-surface-50 pb-20 text-surface-900">
      {/* Navbar */}
      <nav className="h-[72px] bg-white border-b border-surface-100 flex items-center px-6 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <Link href="/candidate/dashboard" className="flex items-center gap-2.5 group">
            <Image src="/hireai-logo.png" alt="HireAI" width={40} height={40} className="rounded-xl object-cover logo-glow group-hover:scale-105 transition-transform" />
            <div>
               <span className="text-lg font-black text-surface-900 tracking-tight block leading-none">HireAI</span>
               <span className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">Candidate</span>
            </div>
          </Link>
          <div className="flex items-center gap-6 text-sm font-bold">
             <Link href="/" className="text-surface-500 hover:text-surface-900 transition-colors flex items-center gap-1.5"><Globe className="w-4 h-4" /> Home</Link>
             <Link href="/candidate/jobs" className="text-surface-500 hover:text-surface-900 transition-colors">Browse Jobs</Link>
             <div className="w-px h-6 bg-surface-200" />
             <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                 {getInitials()}
               </div>
               <button onClick={logout} className="text-surface-500 hover:text-red-500 transition-colors">Logout</button>
             </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Left Column: Profile & Resume */}
          <div className="lg:col-span-1 space-y-6">
            {/* Premium ID Card */}
            <div className="bg-white rounded-3xl border border-surface-100 shadow-card hover:shadow-card-hover transition-all relative overflow-hidden group">
               {/* Premium Banner Background */}
               <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-brand-600 via-brand-500 to-purple-600" />
               <div className="absolute top-0 left-0 w-full h-32 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "16px 16px" }} />
               
               {/* Visual Edit Button */}
               <button 
                onClick={handleEditProfile}
                className="absolute top-4 right-4 z-20 w-8 h-8 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center transition-colors shadow-lg"
               >
                   <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
               </button>

               <div className="relative z-10 flex flex-col items-center text-center mt-12 px-6 pb-8">
                 {/* Avatar with Status Ring */}
                 <div className="relative mb-5 group-hover:scale-105 transition-transform duration-500">
                   <div className="w-28 h-28 bg-white rounded-full p-1.5 shadow-xl">
                     <div className="w-full h-full bg-surface-50 border border-surface-100 rounded-full overflow-hidden flex items-center justify-center text-4xl font-black text-brand-600">
                       {profile?.avatar_url ? (
                          <Image src={profile.avatar_url} alt="Profile" width={112} height={112} className="object-cover w-full h-full" />
                       ) : (
                          profile?.full_name?.charAt(0) || 'U'
                       )}
                     </div>
                   </div>
                   {/* Online Badge */}
                   <div className="absolute bottom-3 right-3 w-5 h-5 bg-green-500 border-4 border-white rounded-full shadow-sm" />
                 </div>
                 
                 <h2 className="text-2xl font-black text-surface-900 tracking-tight leading-none mb-1.5">{profile?.full_name}</h2>
                 <p className="text-brand-600 text-sm font-bold mb-3">{profile?.headline || 'Tech Professional'}</p>
                 <p className="text-surface-500 text-sm font-medium mb-6">{profile?.email}</p>
                 
                 <div className="w-full h-px bg-surface-100 mb-6" />
                 
                 <div className="w-full flex items-center justify-center gap-6">
                   <div className="flex flex-col items-center">
                     <p className="text-[10px] text-surface-400 font-bold uppercase tracking-widest mb-1.5">Experience</p>
                     <p className="text-surface-900 font-black flex items-center gap-1.5 text-sm">
                       <Clock className="w-4 h-4 text-brand-500" /> 
                       {profile?.experience_years > 0 ? `${profile.experience_years} Yrs` : 'Entry Level'}
                     </p>
                   </div>
                   <div className="w-px h-8 bg-surface-100" />
                   <div className="flex flex-col items-center">
                     <p className="text-[10px] text-surface-400 font-bold uppercase tracking-widest mb-1.5">Status</p>
                     <p className="text-surface-900 font-black flex items-center gap-1.5 text-sm">
                       <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Actively looking
                     </p>
                   </div>
                 </div>
               </div>
            </div>

            {/* Resume Upload Module */}
            <div className="bg-white rounded-3xl p-6 border border-surface-100 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest text-surface-900 mb-4 flex items-center gap-2">
                 <FileText className="w-4 h-4 text-brand-500" /> Global Resume
              </h3>
              
              {profile?.resume_url ? (
                <div className="mb-4 p-4 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-between">
                   <div className="flex items-center gap-3 leading-none">
                     <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                       <FileText className="w-5 h-5 text-brand-600" />
                     </div>
                     <div>
                       <div className="text-sm font-bold text-surface-900 mb-1">Resume Active</div>
                       <div className="flex items-center gap-2">
                          <a href={profile.resume_url} target="_blank" rel="noreferrer" className="text-[10px] text-brand-600 hover:underline font-bold uppercase tracking-wider">View File</a>
                          <span className="text-surface-300">|</span>
                          <button 
                            onClick={handleDeleteResume}
                            className="text-[10px] text-surface-400 hover:text-red-500 font-bold uppercase tracking-wider transition-colors"
                          >
                             Remove
                          </button>
                       </div>
                     </div>
                   </div>
                   <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
              ) : (
                <div className="mb-4 p-5 rounded-2xl bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-100 flex items-start gap-4">
                   <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm border border-brand-100">
                     <Sparkles className="w-4 h-4 text-brand-500" />
                   </div>
                   <div>
                     <p className="text-sm text-surface-900 font-bold mb-0.5">Let's find your perfect match</p>
                     <p className="text-xs text-surface-600 font-medium leading-relaxed">Upload a global resume below to unlock personalized AI matching and instant insights.</p>
                   </div>
                </div>
              )}

              <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                  isDragActive ? 'border-brand-500 bg-brand-50' : 'border-surface-200 hover:border-brand-300 hover:bg-surface-50'
                }`}>
                  <input {...getInputProps()} />
                  {uploading ? (
                    <div className="flex flex-col items-center justify-center py-2">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-600 mb-2" />
                      <span className="text-xs font-bold text-brand-700">AI is analyzing...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <Upload className="w-6 h-6 text-surface-400 mb-2" />
                      <span className="text-sm font-bold text-surface-700 mb-1">
                        {profile?.resume_url ? 'Update Resume' : 'Upload Resume'}
                      </span>
                      <span className="text-[10px] text-surface-500 uppercase tracking-wider">PDF or DOCX</span>
                    </div>
                  )}
              </div>
            </div>
          </div>

          {/* Right Column: AI Insights & Matched Jobs */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* AI Insights Card */}
            <div className="bg-white rounded-3xl p-6 border border-surface-100 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center">
                   <Brain className="w-4 h-4 text-brand-600" />
                </div>
                <h3 className="text-lg font-black text-surface-900">AI Profile Insights</h3>
                <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-surface-100 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-surface-600">Active</span>
                </div>
              </div>

              {!profile?.parsed_data ? (
                <div className="py-12 flex flex-col items-center justify-center text-center opacity-50">
                  <Brain className="w-12 h-12 text-surface-300 mb-4" />
                  <p className="text-sm font-bold text-surface-500 max-w-sm">
                    Upload your resume to generate AI insights. We'll automatically extract your top skills and experience to match you with the best roles.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-surface-400 mb-3">Extracted Skills</h4>
                    <div className="flex flex-wrap gap-2">
                       {profile.skills?.map((skill: string, i: number) => (
                        <span key={i} className="px-3 py-1.5 bg-brand-50 text-brand-700 text-xs font-bold rounded-lg border border-brand-100/50">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  {profile.parsed_data?.summary && (
                     <div>
                       <h4 className="text-xs font-black uppercase tracking-widest text-surface-400 mb-2">AI Summary</h4>
                       <div className="relative">
                         <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-400 to-purple-400 rounded-2xl blur opacity-20"></div>
                         <p className="relative text-sm text-surface-700 leading-relaxed bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-brand-100/50 italic shadow-sm">
                           "{profile.parsed_data.summary}"
                         </p>
                       </div>
                     </div>
                  )}
                </div>
              )}
            </div>

            {/* Recommended Jobs */}
            <div>
              <h3 className="text-lg font-black text-surface-900 mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500" /> 
                Recommended for You
              </h3>
              
              {!profile?.parsed_data ? (
                 <div className="bg-white rounded-3xl p-8 border border-surface-100 shadow-sm text-center">
                    <p className="text-sm font-medium text-surface-500">Upload your resume above to see personalized job matches.</p>
                 </div>
              ) : recommendedJobs.length === 0 ? (
                 <div className="bg-white rounded-3xl p-8 border border-surface-100 shadow-sm text-center">
                    <p className="text-sm font-medium text-surface-500">No strong matches right now. Check back later or browse all jobs!</p>
                    <Link href="/candidate/jobs" className="inline-block mt-4 text-brand-600 font-bold hover:underline text-sm">Browse All Jobs</Link>
                 </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {recommendedJobs.slice(0, 4).map((job: any) => (
                    <div key={job.id} className="bg-white rounded-3xl border border-surface-100 hover:border-brand-200 shadow-sm hover:shadow-card-hover hover:shadow-brand-500/5 transition-all duration-300 p-5 group flex flex-col">
                      <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 bg-brand-50 border border-brand-100 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                           <Briefcase className="w-5 h-5 text-brand-600" />
                        </div>
                        {/* Match Indicator Removed */}
                      </div>
                      <h4 className="font-bold text-surface-900 mb-1 group-hover:text-brand-600 transition-colors">{job.title}</h4>
                      <p className="text-xs text-surface-500 font-medium mb-4 flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {job.location || 'Remote'}</p>
                      
                      <Link href={`/candidate/apply?job_id=${job.id}`} className="mt-auto w-full py-2.5 bg-surface-50 group-hover:bg-brand-600 text-surface-900 group-hover:text-white text-xs font-black uppercase tracking-widest rounded-xl text-center transition-all duration-300 shadow-sm group-hover:shadow-brand-500/20">
                        Apply
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Profile Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-bounce-in">
             <div className="bg-gradient-to-r from-brand-600 to-purple-600 p-6">
                <h3 className="text-xl font-black text-white">Edit Profile</h3>
                <p className="text-white/70 text-sm font-medium">Update your public identity on the platform</p>
             </div>
             
             <form onSubmit={handleSaveProfile} className="p-8 space-y-5">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-surface-400">Full Name</label>
                   <input 
                      type="text"
                      required
                      value={editForm.full_name}
                      onChange={e => setEditForm({...editForm, full_name: e.target.value})}
                      className="w-full px-5 py-3.5 bg-surface-50 border border-surface-200 rounded-2xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all font-bold text-surface-900"
                   />
                </div>
                
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-surface-400">Headline</label>
                   <input 
                      type="text"
                      placeholder="e.g. Senior Software Engineer"
                      value={editForm.headline}
                      onChange={e => setEditForm({...editForm, headline: e.target.value})}
                      className="w-full px-5 py-3.5 bg-surface-50 border border-surface-200 rounded-2xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all font-bold text-surface-900"
                   />
                </div>

                <div className="flex items-center gap-3 pt-4">
                   <button 
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="flex-1 py-4 text-surface-600 font-black uppercase tracking-widest text-[10px] hover:bg-surface-50 rounded-2xl transition-colors"
                   >
                      Cancel
                   </button>
                   <button 
                      type="submit"
                      disabled={saving}
                      className="flex-3 py-4 bg-brand-600 hover:bg-brand-700 text-white font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-lg shadow-brand-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                   >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CandidateDashboard() {
  return (
    <AuthGuard requiredRole="candidate">
      <CandidateDashboardInner />
    </AuthGuard>
  )
}
