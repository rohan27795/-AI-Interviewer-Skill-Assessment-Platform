'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import {
  User, Bell, Shield, Monitor, Zap, Building, Users, Key, 
  Mail, Phone, Globe, Save, Eye, EyeOff, Camera, 
  Check, ChevronRight, AlertTriangle, Brain, Sliders,
  ToggleLeft, ToggleRight, Lock, LogOut, Trash2, Plus, X, Loader2
} from 'lucide-react'
import { authApi, profilesApi } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'

// ── Sidebar tabs ──────────────────────────────────────────────────────────────
const tabs = [
  { id: 'profile',       label: 'Profile',          icon: User,     section: 'Account' },
  { id: 'company',       label: 'Company',           icon: Building, section: 'Account' },
  { id: 'team',          label: 'Team Access',       icon: Users,    section: 'Account' },
  { id: 'notifications', label: 'Notifications',     icon: Bell,     section: 'Preferences' },
  { id: 'appearance',    label: 'Appearance',        icon: Monitor,  section: 'Preferences' },
  { id: 'ai',            label: 'AI Configuration',  icon: Brain,    section: 'Platform' },
  { id: 'integrations',  label: 'Integrations',      icon: Zap,      section: 'Platform' },
  { id: 'security',      label: 'Security',          icon: Shield,   section: 'Security' },
]

const sections = ['Account', 'Preferences', 'Platform', 'Security']

// ── Notification toggles ──────────────────────────────────────────────────────
const notifGroups = [
  {
    group: 'Candidate Events',
    items: [
      { key: 'new_app',    label: 'New application received',           def: true  },
      { key: 'ai_match',   label: 'AI match score above threshold',     def: true  },
      { key: 'interview',  label: 'Interview scheduled / cancelled',    def: true  },
      { key: 'offer',      label: 'Offer accepted / rejected',          def: true  },
    ],
  },
  {
    group: 'AI & System',
    items: [
      { key: 'ai_report',  label: 'Assessment report generated',        def: true  },
      { key: 'system',     label: 'System maintenance alerts',          def: false },
      { key: 'weekly',     label: 'Weekly analytics summary email',     def: true  },
    ],
  },
]

// ── AI configuration sliders ──────────────────────────────────────────────────
const aiConfig = [
  { key: 'match_threshold', label: 'Resume Match Threshold',      val: 75,  min: 40,  max: 95, unit: '%',        desc: 'Minimum score for auto-invite' },
  { key: 'interview_depth', label: 'Interview Question Depth',    val: 3,   min: 1,   max: 5, unit: '/5',        desc: 'Range 1 (quick) → 5 (deep-dive)' },
  { key: 'session_timeout', label: 'Interview Session Timeout',   val: 90,  min: 30,  max: 120, unit: 'min',     desc: 'Max interview duration' },
  { key: 'rounds',          label: 'Default Interview Rounds',    val: 3,   min: 1,   max: 4, unit: ' rounds',   desc: 'Intro, Technical, HR, Salary' },
]

const integrations = [
  { name: 'LinkedIn Recruiter', desc: 'Auto-import job applications',              connected: true,  logo: '🔗' },
  { name: 'Google Calendar',    desc: 'Sync interview schedules',                  connected: true,  logo: '📅' },
  { name: 'Slack',              desc: 'Real-time hiring notifications',            connected: false, logo: '💬' },
  { name: 'AWS S3',             desc: 'Resume & recording storage',                connected: true,  logo: '☁️' },
  { name: 'AWS SES',            desc: 'Automated email invites',                   connected: true,  logo: '📧' },
  { name: 'Naukri.com',         desc: 'Post jobs to Indian job board',             connected: false, logo: '🇮🇳' },
]

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-12 h-6 rounded-full transition-all flex-shrink-0 ${on ? 'bg-brand-600' : 'bg-surface-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-6' : ''}`} />
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { updateUser } = useAuth()
  const [activeTab, setActiveTab]   = useState('profile')
  const [showPwd, setShowPwd]       = useState(false)
  const [saved, setSaved]           = useState(false)
  
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  
  const [user, setUser]             = useState<any>(null)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  
  // Form States (Profile)
  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [phone, setPhone]           = useState('')
  const [headline, setHeadline]     = useState('')
  const [avatarUrl, setAvatarUrl]   = useState('/avatar.png')
  
  // Form States (Company)
  const [companyName, setCompanyName] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [companyBio, setCompanyBio] = useState('')
  const [companyIndustry, setCompanyIndustry] = useState('')
  const [companySize, setCompanySize] = useState('')
  
  // Invite
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [isInviting, setIsInviting] = useState(false)

  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [notifs, setNotifs]         = useState<Record<string, boolean>>(
    Object.fromEntries(notifGroups.flatMap(g => g.items.map(i => [i.key, i.def])))
  )
  const [aiVals, setAiVals] = useState<Record<string, number>>(
    Object.fromEntries(aiConfig.map(c => [c.key, c.val]))
  )

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [userData, teamData] = await Promise.all([
          authApi.me(),
          authApi.getTeamMembers().catch(() => [])
        ])
        
        setUser(userData)
        setTeamMembers(teamData)
        
        // Populate profile form
        const p = userData.profile || {}
        const names = (p.full_name || '').split(' ')
        setFirstName(names[0] || '')
        setLastName(names.slice(1).join(' ') || '')
        setPhone(p.phone || '')
        setHeadline(p.headline || '')
        if (p.avatar_url) setAvatarUrl(p.avatar_url)
        
        // Populate company form
        setCompanyName(p.company_name || '')
        setCompanyWebsite(p.company_website || '')
        setCompanyBio(p.bio || '')
        
        const parsed = p.parsed_data || {}
        setCompanyIndustry(parsed.industry || '')
        setCompanySize(parsed.company_size || '')
        
      } catch (err) {
        console.error("Failed to load settings data", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const triggerSaveSuccess = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleSaveProfile = async () => {
    try {
      setSaving(true)
      await profilesApi.updateProfile({
        full_name: `${firstName} ${lastName}`.trim(),
        phone: phone,
        headline: headline
      })
      updateUser({ profile: { full_name: `${firstName} ${lastName}`.trim(), phone, headline } })
      triggerSaveSuccess()
    } catch (err) {
      console.error("Failed to save profile", err)
      alert("Failed to save profile.")
    } finally {
      setSaving(false)
    }
  }
  
  const handleSaveCompany = async () => {
    try {
      setSaving(true)
      
      const currentParsed = user?.profile?.parsed_data || {}
      
      await profilesApi.updateProfile({
        company_name: companyName,
        company_website: companyWebsite,
        bio: companyBio,
        parsed_data: {
          ...currentParsed,
          industry: companyIndustry,
          company_size: companySize
        }
      })
      updateUser({ profile: { company_name: companyName, company_website: companyWebsite, bio: companyBio, parsed_data: { ...currentParsed, industry: companyIndustry, company_size: companySize } } })
      triggerSaveSuccess()
    } catch (err) {
      console.error("Failed to save company profile", err)
      alert("Failed to save company profile.")
    } finally {
      setSaving(false)
    }
  }
  
  const handleInviteMember = async () => {
    if (!inviteName || !inviteEmail) return
    try {
      setIsInviting(true)
      await authApi.inviteTeamMember(inviteName, inviteEmail)
      setInviteName('')
      setInviteEmail('')
      // Refresh team list
      const teamData = await authApi.getTeamMembers()
      setTeamMembers(teamData)
    } catch (e: any) {
      alert(e.message || "Failed to invite member.")
    } finally {
      setIsInviting(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      // temporary preview
      const localUrl = URL.createObjectURL(file)
      setAvatarUrl(localUrl)
      
      try {
        const fd = new FormData()
        fd.append("avatar", file)
        const updated = await profilesApi.uploadAvatar(fd)
        if (updated.avatar_url) {
            setAvatarUrl(updated.avatar_url)
            updateUser({ profile: { avatar_url: updated.avatar_url } })
        }
      } catch(err) {
        console.error("Avatar upload failed", err)
        alert("Failed to upload avatar.")
      }
    }
  }

  const activeSection = tabs.find(t => t.id === activeTab)?.section ?? ''

  if (loading) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
          <p className="text-surface-500 font-medium font-display">Loading Settings...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-display text-surface-900">Settings</h1>
        <p className="text-surface-600 font-medium mt-1">Manage your account, team, and AI configurations</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">

        {/* ── Sidebar ── */}
        <aside className="w-full lg:w-60 flex-shrink-0">
          {sections.map(sec => {
            const items = tabs.filter(t => t.section === sec)
            return (
              <div key={sec} className="mb-5">
                <div className="text-[11px] font-bold text-surface-400 uppercase tracking-widest px-3 mb-2">{sec}</div>
                {items.map(tab => {
                  const active = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5 ${
                        active ? 'bg-brand-50 text-brand-700' : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
                      }`}
                    >
                      <tab.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-brand-600' : 'text-surface-400'}`} />
                      {tab.label}
                      {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-brand-400" />}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </aside>

        {/* ── Content ── */}
        <div className="flex-1 min-w-0">

          {/* ── Profile ── */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <SectionHeader title="Personal Information" desc="Update your display name and contact details" />
              <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-8">
                {/* Avatar */}
                <div className="flex items-center gap-6 mb-8 pb-8 border-b border-surface-100">
                  <div className="relative">
                    <div className="w-20 h-20 bg-surface-100 rounded-2xl flex items-center justify-center text-2xl font-bold text-brand-700 font-display shadow-sm overflow-hidden relative border-2 border-surface-200">
                      {avatarUrl && !avatarUrl.includes('/avatar.png') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarUrl}
                          alt="Avatar"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback to initials if image fails to load
                            e.currentTarget.style.display = 'none'
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement
                            if (fallback) fallback.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <span
                        className="uppercase text-brand-700 w-full h-full flex items-center justify-center"
                        style={{ display: avatarUrl && !avatarUrl.includes('/avatar.png') ? 'none' : 'flex' }}
                      >
                        {firstName?.[0] || 'U'}
                      </span>
                    </div>
                    <button onClick={() => avatarInputRef.current?.click()} className="absolute -bottom-1 -right-1 w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center shadow-md hover:bg-brand-700 transition-colors">
                      <Camera className="w-3.5 h-3.5 text-white" />
                    </button>
                    <input type="file" accept="image/*" className="hidden" ref={avatarInputRef} onChange={handleAvatarUpload} />
                  </div>
                  <div>
                    <div className="font-bold text-surface-900 text-lg">{`${firstName} ${lastName}`.trim() || 'Recruiter'}</div>
                    <div className="text-sm text-surface-500 mb-3">{headline || 'Recruiter'} · {companyName || 'HireAI Customer'}</div>
                    <button onClick={() => avatarInputRef.current?.click()} className="text-xs font-bold text-brand-600 hover:text-brand-700 underline">Upload new photo</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Field label="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} />
                  <Field label="Last Name"  value={lastName} onChange={e => setLastName(e.target.value)} />
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-surface-700 block text-surface-400">Email Address (Read-only)</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"><Mail className="w-4 h-4"/></span>
                        <input disabled value={user?.email || ''} className="w-full pl-10 pr-4 py-2.5 bg-surface-100 border border-surface-200 rounded-xl text-sm text-surface-500 font-medium cursor-not-allowed cursor-no-drop" />
                    </div>
                  </div>
                  <Field label="Phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} icon={<Phone className="w-4 h-4" />} />
                  <div className="md:col-span-2">
                    <Field label="Job Title" value={headline} onChange={e => setHeadline(e.target.value)} />
                  </div>
                </div>

                <SaveBar onSave={handleSaveProfile} saving={saving} saved={saved} />
              </div>
            </div>
          )}

          {/* ── Company ── */}
          {activeTab === 'company' && (
            <div className="space-y-6">
              <SectionHeader title="Company Profile" desc="Details visible to candidates on job postings" />
              <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-8">
                {/* Logo Stub */}
                <div className="flex items-center gap-6 mb-8 pb-8 border-b border-surface-100">
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-brand-700 bg-brand-50 font-display overflow-hidden border-2 border-surface-100 shadow-sm">
                     {companyName ? companyName[0]?.toUpperCase() : 'Y'}
                  </div>
                  <div>
                    <div className="font-bold text-surface-900 text-lg">{companyName || 'Your Company'}</div>
                    <div className="text-sm text-surface-500 mb-3">Settings Dashboard</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Field label="Company Name" value={companyName} onChange={e => setCompanyName(e.target.value)} />
                  <Field label="Industry" value={companyIndustry} onChange={e => setCompanyIndustry(e.target.value)} />
                  <Field label="Company Size" value={companySize} onChange={e => setCompanySize(e.target.value)} placeholder="e.g. 501–1000 employees" />
                  <Field label="Website" value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)} icon={<Globe className="w-4 h-4" />} />
                  <div className="md:col-span-2">
                    <label className="text-sm font-bold text-surface-700 block mb-2">About the Company</label>
                    <textarea
                      value={companyBio}
                      onChange={e => setCompanyBio(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-900 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all resize-none"
                    />
                  </div>
                </div>
                <SaveBar onSave={handleSaveCompany} saving={saving} saved={saved} />
              </div>
            </div>
          )}

          {/* ── Team ── */}
          {activeTab === 'team' && (
            <div className="space-y-6">
              <SectionHeader title="Team & Access" desc="Manage who can access the recruiter portal" />
              <div className="bg-white rounded-2xl border border-surface-100 shadow-card overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
                  <span className="text-sm font-bold text-surface-700">{teamMembers.length} members</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      placeholder="Name" 
                      value={inviteName} 
                      onChange={e => setInviteName(e.target.value)}
                      className="text-sm px-3 py-1.5 border border-surface-200 rounded-lg w-28 outline-none focus:ring-2 ring-brand-500" 
                    />
                    <input 
                      type="email" 
                      placeholder="Email" 
                      value={inviteEmail} 
                      onChange={e => setInviteEmail(e.target.value)}
                      className="text-sm px-3 py-1.5 border border-surface-200 rounded-lg w-40 outline-none focus:ring-2 ring-brand-500" 
                    />
                    <button 
                      onClick={handleInviteMember} 
                      disabled={isInviting || !inviteName || !inviteEmail}
                      className="flex items-center gap-2 text-sm font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors"
                    >
                      {isInviting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4" />} Invite Member
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-surface-50">
                  {teamMembers.length === 0 ? (
                      <div className="px-6 py-6 text-center text-sm font-medium text-surface-500">No team members found.</div>
                  ) : teamMembers.map((m, i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-4 hover:bg-surface-50 transition-colors">
                      <div className="relative">
                        {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-bold text-white uppercase tracking-wider">{m.initials}</div>
                        )}
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white bg-green-400`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-surface-900">{m.name}</div>
                        <div className="text-xs text-surface-500">{m.email}</div>
                      </div>
                      <span className="text-xs font-bold text-surface-600 bg-surface-100 px-3 py-1 rounded-full">{m.role}</span>
                      {user?.email !== m.email && (
                          <button className="text-surface-400 hover:text-red-500 transition-colors p-1" title="Remove member">
                            <X className="w-4 h-4" />
                          </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <SectionHeader title="Notification Preferences" desc="Choose which events trigger alerts" />
              {notifGroups.map(group => (
                <div key={group.group} className="bg-white rounded-2xl border border-surface-100 shadow-card p-6">
                  <h3 className="font-bold text-surface-900 mb-4 font-display">{group.group}</h3>
                  <div className="space-y-4">
                    {group.items.map(item => (
                      <div key={item.key} className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-surface-800">{item.label}</div>
                        </div>
                        <Toggle on={notifs[item.key]} onToggle={() => setNotifs(n => ({ ...n, [item.key]: !n[item.key] }))} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <SaveBar onSave={triggerSaveSuccess} saved={saved} />
            </div>
          )}

          {/* ── Appearance ── */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <SectionHeader title="Appearance" desc="Customise the look and feel of the dashboard" />
              <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6 space-y-6">
                <div>
                  <label className="text-sm font-bold text-surface-700 block mb-3">Theme Mode</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['Light', 'Dark', 'System'].map(t => (
                      <button key={t} className={`py-3 rounded-xl border text-sm font-bold transition-all ${t === 'Light' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-bold text-surface-700 block mb-3">Accent Colour</label>
                  <div className="flex gap-3">
                    {['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'].map(c => (
                      <button key={c} className={`w-9 h-9 rounded-xl transition-all shadow-sm ring-2 ring-offset-2 ${c === '#6366f1' ? 'ring-brand-500 scale-110' : 'ring-transparent'}`} style={{ background: c }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-bold text-surface-700 block mb-3">Sidebar Style</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['Compact', 'Default'].map(s => (
                      <button key={s} className={`py-3 rounded-xl border text-sm font-bold transition-all ${s === 'Default' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50'}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <SaveBar onSave={triggerSaveSuccess} saved={saved} />
              </div>
            </div>
          )}

          {/* ── AI Configuration ── */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              <SectionHeader title="AI Configuration" desc="Fine-tune how the HireAI interview engine behaves" />
              <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6 space-y-6">
                {aiConfig.map(cfg => (
                  <div key={cfg.key}>
                    <div className="flex items-end justify-between mb-2">
                      <div>
                        <div className="text-sm font-bold text-surface-800">{cfg.label}</div>
                        <div className="text-xs text-surface-500">{cfg.desc}</div>
                      </div>
                      <span className="text-xl font-bold font-display text-brand-600">{aiVals[cfg.key]}{cfg.unit}</span>
                    </div>
                    <input
                      type="range"
                      min={cfg.min}
                      max={cfg.max}
                      value={aiVals[cfg.key]}
                      onChange={e => setAiVals(v => ({ ...v, [cfg.key]: Number(e.target.value) }))}
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[11px] text-surface-400 font-bold mt-1">
                      <span>{cfg.min}{cfg.unit}</span>
                      <span>{cfg.max}{cfg.unit}</span>
                    </div>
                  </div>
                ))}

                {/* Open AI Model */}
                <div className="pt-4 border-t border-surface-100">
                  <label className="text-sm font-bold text-surface-700 block mb-2">OpenAI Model</label>
                  <select className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm font-medium text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all">
                    <option>gpt-4o (Recommended)</option>
                    <option>gpt-4o-mini</option>
                    <option>gpt-4-turbo</option>
                  </select>
                </div>
                {/* Realtime Model */}
                <div>
                  <label className="text-sm font-bold text-surface-700 block mb-2">Realtime Voice Model</label>
                  <select className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm font-medium text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all">
                    <option>gpt-4o-realtime-preview (Recommended)</option>
                    <option>gpt-4o-mini-realtime-preview</option>
                  </select>
                </div>
                <SaveBar onSave={triggerSaveSuccess} saved={saved} />
              </div>
            </div>
          )}

          {/* ── Integrations ── */}
          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <SectionHeader title="Integrations" desc="Connect third-party services to supercharge your recruiting" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {integrations.map((itg, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-surface-100 shadow-card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center text-2xl flex-shrink-0">{itg.logo}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-surface-900">{itg.name}</div>
                      <div className="text-xs text-surface-500 mt-0.5 truncate">{itg.desc}</div>
                    </div>
                    <button className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex-shrink-0 ${
                      itg.connected
                        ? 'bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600'
                        : 'bg-brand-600 text-white hover:bg-brand-700'
                    }`}>
                      {itg.connected ? '✓ Connected' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Security ── */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <SectionHeader title="Security Settings" desc="Control your account security and active sessions" />
              
              {/* Change Password */}
              <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6 space-y-5">
                <h3 className="font-bold font-display text-surface-900">Change Password</h3>
                <div className="relative">
                  <label className="text-sm font-bold text-surface-700 block mb-2">Current Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                    <input type={showPwd ? 'text' : 'password'} placeholder="••••••••" className="w-full pl-10 pr-10 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all" />
                    <button onClick={() => setShowPwd(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Field label="New Password"     type="password" placeholder="Min. 12 characters" />
                <Field label="Confirm Password" type="password" placeholder="Re-enter new password" />
                <SaveBar onSave={triggerSaveSuccess} saved={saved} label="Update Password" />
              </div>

              {/* 2FA */}
              <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-bold font-display text-surface-900 mb-1">Two-Factor Authentication</h3>
                    <p className="text-sm text-surface-500">Add an extra layer of security to your account.</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Disabled</span>
                </div>
                <button className="mt-4 flex items-center gap-2 text-sm font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 px-5 py-2.5 rounded-xl transition-colors">
                  <Key className="w-4 h-4" /> Enable 2FA
                </button>
              </div>

              {/* Danger Zone */}
              <div className="bg-red-50 rounded-2xl border border-red-200 p-6">
                <div className="flex items-center gap-2 text-red-700 font-bold mb-2">
                  <AlertTriangle className="w-4 h-4" /> Danger Zone
                </div>
                <p className="text-sm text-red-700 mb-4">This action is irreversible. All data will be permanently deleted.</p>
                <button className="flex items-center gap-2 text-sm font-bold text-red-700 bg-white border border-red-300 hover:bg-red-50 px-5 py-2.5 rounded-xl transition-colors shadow-sm">
                  <Trash2 className="w-4 h-4" /> Delete Account
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Helper sub-components ──────────────────────────────────────────────────────

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold font-display text-surface-900">{title}</h2>
      <p className="text-sm text-surface-500 font-medium mt-0.5">{desc}</p>
    </div>
  )
}

function Field({
  label, type = 'text', value, defaultValue, placeholder, icon, onChange
}: {
  label: string; type?: string; value?: string; defaultValue?: string; placeholder?: string; icon?: React.ReactNode; onChange?: (e: any) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-surface-700 block">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">{icon}</span>}
        <input
          type={type}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full ${icon ? 'pl-10' : 'px-4'} pr-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-900 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all`}
        />
      </div>
    </div>
  )
}

function SaveBar({ onSave, saving, saved, label = 'Save Changes' }: { onSave: () => void; saving?: boolean; saved: boolean; label?: string }) {
  return (
    <div className="flex justify-end pt-6 border-t border-surface-100 mt-6">
      <button
        onClick={onSave}
        disabled={saving}
        className={`flex items-center gap-2 font-semibold text-sm px-6 py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50 ${
          saved ? 'bg-green-500 text-white' : 'bg-brand-600 hover:bg-brand-700 text-white'
        }`}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : saved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> {label}</>}
      </button>
    </div>
  )
}
