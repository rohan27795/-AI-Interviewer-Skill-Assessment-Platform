'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { 
  ArrowRight, Brain, Video, Mic, BarChart3, Shield, 
  CheckCircle, Star, Play, Zap, Users, Clock, 
  Sparkles, Target, TrendingUp, ChevronRight
} from 'lucide-react'

const stats = [
  { value: '10×', label: 'Faster Screening' },
  { value: '94%', label: 'Evaluation Accuracy' },
  { value: '50K+', label: 'Interviews Completed' },
  { value: '4.9★', label: 'Recruiter Satisfaction' },
]

const features = [
  {
    icon: Brain,
    title: 'Intelligent Resume Analysis',
    desc: 'Automatically extract and evaluate skills, experience, and qualifications from any resume format with enterprise-grade precision.',
    gradient: 'from-violet-500 to-indigo-600',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
    iconColor: 'text-violet-600',
  },
  {
    icon: Video,
    title: 'Live Video Interviews',
    desc: 'High-definition video interview sessions with real-time AI analysis of communication style, engagement, and professional presence.',
    gradient: 'from-purple-500 to-pink-600',
    bg: 'bg-purple-50',
    border: 'border-purple-100',
    iconColor: 'text-purple-600',
  },
  {
    icon: Mic,
    title: 'Conversational AI Interviewer',
    desc: 'Natural, low-latency voice conversations that feel human — dynamically adapting to each candidate\'s responses and expertise.',
    gradient: 'from-pink-500 to-rose-600',
    bg: 'bg-pink-50',
    border: 'border-pink-100',
    iconColor: 'text-pink-600',
  },
  {
    icon: BarChart3,
    title: 'Comprehensive Scorecards',
    desc: 'Multi-dimensional assessments covering technical proficiency, behavioural patterns, and cultural alignment — all in one report.',
    gradient: 'from-blue-500 to-indigo-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    iconColor: 'text-blue-600',
  },
  {
    icon: Sparkles,
    title: 'Adaptive Questioning',
    desc: 'Interview depth adjusts in real time based on candidate answers, probing deeper into areas of strength and uncovering gaps.',
    gradient: 'from-amber-500 to-orange-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    iconColor: 'text-amber-600',
  },
  {
    icon: Shield,
    title: 'Standardised, Bias-Free Evaluation',
    desc: 'Consistent scoring criteria applied to every candidate ensures fair, objective decisions free from unconscious bias.',
    gradient: 'from-emerald-500 to-teal-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    iconColor: 'text-emerald-600',
  },
]

const rounds = [
  { number: '01', title: 'Introduction & Culture Fit', desc: 'Assesses professional background, communication style, and organisational alignment.', color: 'from-violet-500 to-indigo-600' },
  { number: '02', title: 'Technical Proficiency', desc: 'Role-specific questions tailored to the job description and candidate\'s stated expertise.', color: 'from-purple-500 to-pink-600' },
  { number: '03', title: 'Behavioural & Leadership', desc: 'Structured scenario-based questions exploring decision-making, collaboration, and values.', color: 'from-amber-500 to-orange-500' },
  { number: '04', title: 'Offer & Compensation', desc: 'Guided compensation discussion aligned with defined salary bands, with a documented outcome.', color: 'from-emerald-500 to-teal-600' },
]

const testimonials = [
  {
    name: 'Priya Sharma',
    role: 'Head of Talent Acquisition',
    company: 'TechCorp India',
    avatar: 'PS',
    text: 'HireAI reduced our time-to-hire from 45 days to 8 days. The calibre of candidates reaching the final stage improved significantly across all roles.',
    rating: 5,
    color: 'from-violet-500 to-indigo-600',
  },
  {
    name: 'Rahul Mehta',
    role: 'Chief Technology Officer',
    company: 'StartupHub',
    avatar: 'RM',
    text: 'The technical evaluation quality is exceptional. Our engineers now focus on final-stage conversations rather than initial screening.',
    rating: 5,
    color: 'from-purple-500 to-pink-600',
  },
  {
    name: 'Anjali Gupta',
    role: 'HR Director',
    company: 'FinTech Solutions',
    avatar: 'AG',
    text: 'Candidates consistently report a positive experience — flexible scheduling, immediate structured feedback, and a process that truly feels fair.',
    rating: 5,
    color: 'from-emerald-500 to-teal-600',
  },
]

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState('')

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => {
    const sectionIds = ['features', 'how-it-works', 'pricing', 'about']
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        })
      },
      { rootMargin: '-30% 0px -60% 0px' }
    )
    sectionIds.forEach(id => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">

      {/* ─── NAVBAR ─── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled 
          ? 'bg-white/95 backdrop-blur-2xl shadow-sm border-b border-surface-100' 
          : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-6 h-[68px] flex items-center justify-between">
          <Link 
            href="/" 
            className="flex items-center gap-2.5 group cursor-pointer"
            onClick={(e) => {
              if (window.location.pathname === '/') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >
            <Image src="/hireai-logo.png" alt="HireAI" width={40} height={40} priority className="rounded-xl object-cover shadow-md logo-glow group-hover:scale-105 transition-transform" />
            <span className="text-xl font-bold text-surface-900 tracking-tight">HireAI</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-0.5">
            {[
              { label: 'Features', id: 'features' },
              { label: 'How It Works', id: 'how-it-works' },
              { label: 'Pricing', id: 'pricing' },
              { label: 'About', id: 'about' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  activeSection === item.id
                    ? 'text-brand-600 bg-brand-50'
                    : 'text-surface-500 hover:text-surface-900 hover:bg-surface-50'
                }`}
              >
                {item.label}
                {activeSection === item.id && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-brand-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link href="/auth/login" 
              className="text-sm font-medium text-surface-600 hover:text-brand-600 transition-colors px-4 py-2 rounded-xl hover:bg-brand-50">
              Sign In
            </Link>
            <Link href="/auth/register"
              className="btn-primary text-sm font-semibold text-white px-5 py-2.5 rounded-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #d946ef 100%)', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' }}>
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-[68px] overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 90% 90%, rgba(217,70,239,0.08) 0%, transparent 70%), #fff' }} />
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle, rgba(99,102,241,0.06) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }} />

        {/* Glow orbs */}
        <div className="absolute top-32 left-1/4 w-96 h-96 bg-brand-400/10 rounded-full blur-3xl animate-glow-pulse pointer-events-none" />
        <div className="absolute bottom-32 right-1/4 w-64 h-64 bg-accent-400/10 rounded-full blur-3xl animate-glow-pulse delay-300 pointer-events-none" />

        <div className="relative w-full max-w-7xl mx-auto px-6 py-24 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 mb-8 animate-slide-up-fade">
            <span className="section-label">
              <Sparkles className="w-3 h-3" />
              Enterprise AI Recruitment Platform
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl lg:text-5xl xl:text-6xl font-black tracking-tight text-surface-900 mb-6 animate-slide-up-fade delay-100" style={{ lineHeight: '1.05', letterSpacing: '-0.035em' }}>
            Hire Smarter.<br />
            <span className="gradient-text">Move Faster.</span>
          </h1>

          {/* Subtext */}
          <p className="text-lg text-surface-500 font-normal leading-relaxed mb-12 max-w-2xl mx-auto animate-slide-up-fade delay-200" style={{ letterSpacing: '-0.01em' }}>
            From intelligent resume screening to multi-round AI video interviews — automate your entire recruitment pipeline and hire the best candidates in days, not months.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-16 animate-slide-up-fade delay-300">
            <Link href="/auth/register?role=recruiter"
              className="btn-primary flex items-center gap-2.5 text-white font-semibold px-8 py-4 rounded-2xl text-base"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #d946ef 100%)', boxShadow: '0 8px 32px rgba(99,102,241,0.35)' }}>
              Start Hiring for Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/candidate/jobs"
              className="btn-secondary flex items-center gap-2.5 text-surface-700 font-semibold px-8 py-4 rounded-2xl text-base border border-surface-200 bg-white hover:border-brand-200 shadow-sm"
            >
              <Play className="w-4 h-4 text-brand-500" />
              Apply as Candidate
            </Link>
          </div>

          {/* Social Proof Row */}
          <div className="flex items-center justify-center gap-6 animate-slide-up-fade delay-500">
            <div className="flex -space-x-3">
              {['PS', 'RM', 'AG', 'NK', 'VK'].map((initials, i) => (
                <div key={i} className="w-9 h-9 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold text-white shadow-sm"
                     style={{ background: `hsl(${i * 50 + 210}, 65%, 55%)` }}>
                  {initials}
                </div>
              ))}
            </div>
            <div className="h-8 w-px bg-surface-200" />
            <div className="flex items-center gap-1.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
              ))}
              <span className="text-sm text-surface-600 ml-1.5 font-medium">Trusted by <strong className="text-surface-900">500+</strong> companies</span>
            </div>
          </div>

          {/* Hero Image */}
          <div className="relative max-w-2xl mx-auto mt-12 animate-fade-in delay-500">
            <div className="relative rounded-2xl overflow-hidden border border-surface-100 shadow-xl" style={{ boxShadow: '0 15px 35px -5px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.02)' }}>
              <Image 
                src="/hero-v4.png" 
                alt="HireAI Platform Dashboard" 
                width={1000} 
                height={562} 
                className="w-full h-auto opacity-100" 
                priority 
              />
              {/* Overlay shimmer on top edge */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </div>
            {/* Floating metric cards - slightly resized */}
            <div className="absolute -left-12 top-1/4 bg-white/90 backdrop-blur-md rounded-2xl shadow-card-hover border border-surface-100/50 p-4 animate-float hidden lg:block">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <div className="text-[10px] text-surface-500 font-bold uppercase tracking-wider">Match Score</div>
                  <div className="text-lg font-black text-green-500">94% Fit</div>
                </div>
              </div>
            </div>
            <div className="absolute -right-12 bottom-1/4 bg-white/90 backdrop-blur-md rounded-2xl shadow-card-hover border border-surface-100/50 p-4 animate-float delay-200 hidden lg:block">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-brand-500" />
                </div>
                <div>
                  <div className="text-[10px] text-surface-500 font-bold uppercase tracking-wider">Time Saved</div>
                  <div className="text-lg font-black text-brand-600">37 hrs/wk</div>
                </div>
              </div>
            </div>
            {/* Bottom soft vignette */}
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* ─── STATS BAR ─── */}
      <section className="relative py-16 border-y border-surface-100 bg-surface-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-black tracking-tight gradient-text mb-1" style={{ animationDelay: `${i * 100}ms` }}>{stat.value}</div>
                <div className="text-xs text-surface-500 font-semibold uppercase tracking-widest">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-24">
            <span className="section-label mb-5 inline-flex">
              <Zap className="w-3 h-3" />
              Platform Capabilities
            </span>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight text-surface-900 mb-6 mt-6" style={{ letterSpacing: '-0.03em' }}>
              Everything you need to<br />
              <span className="gradient-text">hire with confidence</span>
            </h2>
            <p className="text-base text-surface-500 max-w-2xl mx-auto leading-relaxed">
              A complete AI recruitment platform built for modern HR teams who demand quality, speed, and fairness at every stage.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="group card-float p-7">
                <div className={`w-12 h-12 ${f.bg} ${f.border} border rounded-2xl flex items-center justify-center mb-5`}>
                  <f.icon className={`w-6 h-6 ${f.iconColor}`} />
                </div>
                <h3 className="text-base font-bold text-surface-900 mb-2.5 leading-tight">{f.title}</h3>
                <p className="text-sm text-surface-500 leading-relaxed">{f.desc}</p>
                <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-brand-500 opacity-0 group-hover:opacity-100 transition-all duration-200">
                  Explore feature <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            ))}
          </div>

          {/* Features Illustration */}
          <div className="mt-12 relative max-w-2xl mx-auto rounded-2xl overflow-hidden border border-surface-100 shadow-lg">
            <Image 
              src="/features-v4.png" 
              alt="Platform Features Illustration" 
              width={1000} 
              height={500}
              className="w-full h-auto"
            />
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="py-24 bg-surface-950 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />
        <div className="absolute inset-0 bg-mesh-gradient opacity-10" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-400 bg-brand-500/10 border border-brand-500/20 px-4 py-2 rounded-full mb-5">
              <Target className="w-3 h-3" />
              Structured Process
            </span>
            <h2 className="text-5xl font-black tracking-tight text-white mb-5 mt-5" style={{ letterSpacing: '-0.03em' }}>
              A structured 4-round<br />
              <span className="gradient-text">interview architecture</span>
            </h2>
            <p className="text-lg text-surface-400 max-w-xl mx-auto leading-relaxed">
              Designed to mirror the depth of a real interview process — fully automated and delivered in a fraction of the time.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {rounds.map((round, i) => (
              <div key={round.number} className="relative group">
                {i < rounds.length - 1 && (
                  <div className="hidden lg:block absolute top-9 left-[calc(100%-2px)] w-full h-px border-t border-dashed border-surface-700 z-0" />
                )}
                <div className="relative z-10 bg-surface-800/60 rounded-2xl p-6 border border-surface-700/50 hover:border-brand-500/40 transition-all duration-300 hover:bg-surface-800/80 cursor-default">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black mb-5 bg-gradient-to-br ${round.color}`}
                       style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                    {round.number}
                  </div>
                  <h3 className="font-bold text-white mb-2 text-sm leading-snug">{round.title}</h3>
                  <p className="text-xs text-surface-400 leading-relaxed">{round.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <span className="section-label mb-5 inline-flex">
              <Star className="w-3 h-3" />
              Customer Stories
            </span>
            <h2 className="text-5xl font-black tracking-tight text-surface-900 mb-4 mt-5" style={{ letterSpacing: '-0.03em' }}>
              Trusted by<br />
              <span className="gradient-text">industry leaders</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="card-float p-8">
                {/* Stars */}
                <div className="flex items-center gap-1 mb-6">
                  {[...Array(t.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-surface-600 text-sm leading-relaxed mb-8 italic">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3 pt-4 border-t border-surface-100">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br ${t.color}`}>
                    {t.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-surface-900 text-sm">{t.name}</div>
                    <div className="text-xs text-surface-500">{t.role} · {t.company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-32 bg-surface-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-20">
            <span className="section-label mb-5 inline-flex">
              <Zap className="w-3 h-3" />
              Transparent Pricing
            </span>
            <h2 className="text-5xl font-black tracking-tight text-surface-900 mb-4 mt-5" style={{ letterSpacing: '-0.03em' }}>
              Simple, <span className="gradient-text">predictable</span> pricing
            </h2>
            <p className="text-lg text-surface-500 max-w-xl mx-auto">No surprises. Start free and scale as you grow.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 items-start">
            {[
              { 
                name: 'Starter', price: 'Free', period: '', desc: 'Perfect for small teams',
                features: ['5 AI interviews / month', 'Basic analytics dashboard', 'Email support'],
                highlight: false,
                cta: 'Get Started'
              },
              { 
                name: 'Pro', price: '₹9,999', period: '/mo', desc: 'For scaling teams',
                features: ['Unlimited interviews', 'Advanced analytics', 'Priority support', 'Custom job descriptions', 'ATS integrations'],
                highlight: true,
                cta: 'Start Free Trial'
              },
              { 
                name: 'Enterprise', price: 'Custom', period: '', desc: 'For large organisations',
                features: ['Unlimited everything', 'Dedicated account manager', 'SLA guarantee', 'Custom AI training', 'GDPR & compliance'],
                highlight: false,
                cta: 'Contact Sales'
              },
            ].map(plan => (
              <div key={plan.name} className={`rounded-3xl p-7 border transition-all ${
                plan.highlight
                  ? 'border-transparent shadow-2xl text-white'
                  : 'bg-white border-surface-100 shadow-card'
              }`}
              style={plan.highlight ? { background: 'linear-gradient(155deg, #6366f1 0%, #7c3aed 50%, #d946ef 100%)', boxShadow: '0 24px 48px rgba(99,102,241,0.35)' } : {}}>
                <div className={`text-xs font-black uppercase tracking-[0.1em] mb-3 ${plan.highlight ? 'text-white/60' : 'text-brand-500'}`}>{plan.name}</div>
                <div className="text-5xl font-black tracking-tight mb-1">{plan.price}</div>
                {plan.period && <div className={`text-sm font-medium mb-1 ${plan.highlight ? 'text-white/60' : 'text-surface-400'}`}>{plan.period}</div>}
                <p className={`text-sm mb-7 mt-1 ${plan.highlight ? 'text-white/60' : 'text-surface-400'}`}>{plan.desc}</p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className={`flex items-center gap-2.5 text-sm ${plan.highlight ? 'text-white/90' : 'text-surface-600'}`}>
                      <CheckCircle className={`w-4 h-4 shrink-0 ${plan.highlight ? 'text-white/80' : 'text-brand-400'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/auth/register" className={`block w-full text-center py-3.5 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  plan.highlight 
                    ? 'bg-white text-brand-600 hover:bg-surface-50' 
                    : 'border-2 border-surface-200 text-surface-800 hover:border-brand-300 hover:text-brand-600'
                }`}>{plan.cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── ABOUT ─── */}
      <section id="about" className="py-32 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="section-label mb-6 inline-flex">
                <Brain className="w-3 h-3" />
                Our Mission
              </span>
              <h2 className="text-5xl font-black tracking-tight text-surface-900 mt-5 mb-6" style={{ letterSpacing: '-0.03em' }}>
                Built for the<br />
                <span className="gradient-text">future of work</span>
              </h2>
              <p className="text-base text-surface-500 leading-relaxed mb-8">
                HireAI was built by a team of engineers, talent specialists, and product designers who believe hiring should be measurably fair, blazingly fast, and deeply intelligent. We combine state-of-the-art AI with thoughtful experience design to create a process that candidates respect and recruiters trust.
              </p>
              <div className="flex flex-wrap gap-3">
                {['ISO 27001 Certified', 'GDPR Compliant', 'SOC 2 Type II', 'Zero Bias Guarantee'].map(badge => (
                  <span key={badge} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-surface-100 text-surface-700 border border-surface-200">{badge}</span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: '⚡', title: 'Speed at Scale', value: '10×', desc: 'faster time-to-hire vs. traditional processes' },
                { icon: '⚖️', title: 'Proven Fairness', value: '0%', desc: 'bias across gender, caste, and background evaluations' },
                { icon: '📊', title: 'Deeper Insight', value: '8+', desc: 'evaluation dimensions per candidate per round' },
                { icon: '🌍', title: 'Global Reach', value: '50+', desc: 'industries and verticals supported out of the box' },
              ].map(v => (
                <div key={v.title} className="card-float p-5">
                  <div className="text-2xl mb-3">{v.icon}</div>
                  <div className="text-3xl font-black gradient-text mb-1">{v.value}</div>
                  <div className="font-semibold text-surface-900 text-sm mb-1">{v.title}</div>
                  <div className="text-xs text-surface-500 leading-relaxed">{v.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-32 relative overflow-hidden bg-surface-950">
        <div className="absolute inset-0 bg-mesh-gradient opacity-20" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
        
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <div className="text-6xl mb-8">🚀</div>
          <h2 className="text-5xl lg:text-6xl font-black tracking-tight text-white mb-5" style={{ letterSpacing: '-0.03em' }}>
            Ready to transform<br />
            <span className="gradient-text">your hiring pipeline?</span>
          </h2>
          <p className="text-lg text-surface-400 mb-12 max-w-xl mx-auto leading-relaxed">
            Join 500+ forward-thinking companies automating recruitment with AI. Start free — no credit card required.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/auth/register?role=recruiter"
              className="btn-primary flex items-center gap-2.5 text-white font-semibold px-9 py-4 rounded-2xl text-base"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #d946ef 100%)', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
              Start Free Trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/auth/register?role=candidate"
              className="btn-secondary flex items-center gap-2.5 font-semibold px-9 py-4 rounded-2xl text-base border border-surface-700 text-surface-300 hover:border-surface-500 hover:text-white">
              Apply as Candidate
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-surface-950 py-12 border-t border-surface-800/60">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-col items-center md:items-start gap-3">
              <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <Image src="/hireai-logo.png" alt="HireAI" width={32} height={32} className="rounded-lg object-cover opacity-80 logo-glow" />
                <span className="font-bold text-lg text-white">HireAI</span>
                <span className="text-surface-700 text-xs hidden sm:block">— AI Recruitment Platform</span>
              </Link>
              <div className="text-xs text-surface-400 mt-1 flex items-center gap-2">
                <span className="font-semibold text-surface-300">Contact Developer:</span>
                <a href="mailto:ashishsingh0045@gmail.com" className="hover:text-white transition-colors">ashishsingh0045@gmail.com</a>
                <span className="text-surface-700">•</span>
                <a href="tel:6206605921" className="hover:text-white transition-colors">6206605921</a>
              </div>
            </div>
            <p className="text-xs text-surface-600 text-center">© 2026 HireAI Technologies. All rights reserved. Designed for smarter hiring.</p>
            <div className="flex gap-6">
              {['Privacy Policy', 'Terms of Service', 'Support'].map(link => (
                <a key={link} href="#" className="text-xs text-surface-600 hover:text-surface-300 transition-colors">{link}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
