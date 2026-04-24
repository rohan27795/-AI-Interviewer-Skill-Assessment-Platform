'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import axios from 'axios'
import Link from 'next/link'
import Image from 'next/image'
import { 
  Video, VideoOff, Mic, MicOff, Settings, 
  MessageSquare, Users, Shield, Send, Sparkles,
  Loader2, CheckCircle, AlertCircle, Play, Pause,
  Volume2, VolumeX, Mic as LucideMic, Brain, Calendar, Clock, ArrowRight, Wifi, MapPin
} from 'lucide-react'
import { getApiUrl } from '@/lib/api'
import toast from 'react-hot-toast'

// Mock available slots grouped by day
const availableSlots = [
  {
    date: 'Wed, 19 Mar 2026',
    dayLabel: 'Tomorrow',
    slots: [
      { id: '20260319-1000', time: '10:00 AM', available: true },
      { id: '20260319-1130', time: '11:30 AM', available: true },
      { id: '20260319-1400', time: '2:00 PM', available: false },
      { id: '20260319-1530', time: '3:30 PM', available: true },
    ],
  },
  {
    date: 'Thu, 20 Mar 2026',
    dayLabel: 'Thursday',
    slots: [
      { id: '20260320-0930', time: '9:30 AM', available: true },
      { id: '20260320-1100', time: '11:00 AM', available: true },
      { id: '20260320-1300', time: '1:00 PM', available: true },
      { id: '20260320-1600', time: '4:00 PM', available: false },
    ],
  },
  {
    date: 'Fri, 21 Mar 2026',
    dayLabel: 'Friday',
    slots: [
      { id: '20260321-1000', time: '10:00 AM', available: true },
      { id: '20260321-1500', time: '3:00 PM', available: true },
    ],
  },
  {
    date: 'Mon, 24 Mar 2026',
    dayLabel: 'Monday',
    slots: [
      { id: '20260324-0930', time: '9:30 AM', available: true },
      { id: '20260324-1100', time: '11:00 AM', available: true },
      { id: '20260324-1400', time: '2:00 PM', available: true },
      { id: '20260324-1600', time: '4:00 PM', available: true },
    ],
  },
]

function ScheduleContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appId = searchParams.get('app_id')
  
  const [availableSlots, setAvailableSlots] = useState<any[]>([])
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [bookingDetails, setBookingDetails] = useState<any>(null)
  const [appData, setAppData] = useState<any>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const fetchInterview = async (interviewId: string) => {
    try {
      const API_URL = getApiUrl();
      const response = await fetch(`${API_URL}/api/v1/interviews/${interviewId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch interview details');
      }
      const data = await response.json();
      // Process interview data if needed
      return data;
    } catch (error) {
      console.error("Error fetching interview:", error);
      toast.error('Failed to load interview details');
      return null;
    }
  }

  useEffect(() => {
    const fetchSlots = async () => {
      if (!appId) {
        toast.error('Missing application ID')
        setLoadingSlots(false)
        return
      }
      try {
        const API_URL = getApiUrl();
        const response = await axios.get(`${API_URL}/api/v1/schedule/slots?application_id=${appId}`)
        // Group slots by date for the UI
        const slots: any[] = response.data
        const grouped: any[] = []
        slots.forEach((s) => {
          const dateStr = new Date(s.start_time).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
          let day = grouped.find(g => g.date === dateStr)
          if (!day) {
            day = { date: dateStr, slots: [] }
            grouped.push(day)
          }
          day.slots.push({ id: s.slot_id, time: new Date(s.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), available: s.available })
        })
        setAvailableSlots(grouped)
      } catch (err: any) {
        if (err.response?.status === 403) {
          setPageError(err.response?.data?.detail || "You do not meet the minimum score requirement.");
        } else {
          toast.error('Failed to load slots')
        }
      } finally {
        setLoadingSlots(false)
      }
    }
    fetchSlots()
  }, [appId])

  useEffect(() => {
    const fetchAppStatus = async () => {
      if (!appId) return
      try {
        const API_URL = getApiUrl();
        const response = await axios.get(`${API_URL}/api/v1/applications/${appId}/status`)
        setAppData(response.data)
      } catch (err: any) {
        console.error("Failed to fetch application status:", err)
        setPageError(err.response?.data?.detail || "Application not found. Please check your link.")
      }
    }
    fetchAppStatus()
  }, [appId])

  const getSelectedSlotDetails = () => {
    for (const day of availableSlots) {
      const slot = day.slots.find((s: any) => s.id === selectedSlot)
      if (slot) return { date: day.date, time: slot.time }
    }
    return null
  }

  const handleConfirm = async () => {
    if (!selectedSlot || !appId) return
    setConfirming(true)
    try {
      const API_URL = getApiUrl();
      const response = await axios.post(`${API_URL}/api/v1/schedule/book`, {
        application_id: appId,
        slot_id: selectedSlot
      })
      setBookingDetails(response.data)
      setConfirmed(true)
      toast.success('Interview scheduled!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to confirm. Please try again.')
    } finally {
      setConfirming(false)
    }
  }

  const details = getSelectedSlotDetails()

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <nav className="h-[68px] bg-white border-b border-surface-100 flex items-center px-6 sticky top-0 z-30" style={{ boxShadow: '0 1px 0 #f1f5f9' }}>
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image src="/hireai-logo.png" alt="HireAI" width={38} height={38} className="rounded-xl object-cover logo-glow group-hover:scale-105 transition-transform" />
          <span className="text-lg font-bold text-surface-900 tracking-tight">HireAI</span>
        </Link>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {pageError ? (
          <div className="text-center py-20 animate-fade-in">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${pageError?.includes('score') ? 'bg-blue-50' : 'bg-red-100'}`}>
              <AlertCircle className={`w-10 h-10 ${pageError?.includes('score') ? 'text-blue-500' : 'text-red-500'}`} />
            </div>
            <h2 className="text-2xl font-bold text-surface-900 mb-2">
              {pageError?.includes('score') ? 'Application Under Review' : 'Something Went Wrong'}
            </h2>
            <p className="text-surface-600 mb-8 max-w-sm mx-auto">{pageError}</p>
            <Link href="/" className="inline-flex items-center gap-2 text-brand-600 font-semibold hover:underline">
              Back to Homepage
            </Link>
          </div>
        ) : !confirmed ? (
          <>
            <div className="text-center mb-10 animate-slide-up">
              {appData ? (
                appData.ai_score >= 0.50 ? (
                  <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-full px-4 py-2 text-sm font-semibold mb-4">
                    <CheckCircle className="w-4 h-4" /> {Math.round(appData.ai_score * 100)}% Fit Score — You have been Shortlisted
                  </div>
                ) : appData.ai_score > 0 ? (
                  <div className="inline-flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-full px-4 py-2 text-sm font-semibold mb-4">
                    <AlertCircle className="w-4 h-4" /> {Math.round(appData.ai_score * 100)}% Fit Score — Application Under Review
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-4 py-2 text-sm font-semibold mb-4">
                    <Sparkles className="w-4 h-4 animate-pulse" /> Finalizing your Match Profile...
                  </div>
                )
              ) : (
                <div className="inline-flex items-center gap-2 bg-surface-50 text-surface-500 border border-surface-200 rounded-full px-4 py-2 text-sm font-semibold mb-4">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading your profile...
                </div>
              )}
              <h1 className="text-3xl font-bold font-display text-surface-900 mb-3">
                Schedule Your Interview
              </h1>
              <p className="text-surface-600 font-medium max-w-md mx-auto">
                Select a convenient 45-minute session. Your interview is conducted via a structured AI-driven video and voice format.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Slot Picker */}
              <div className="lg:col-span-2 bg-white rounded-3xl border border-surface-100 shadow-card p-6 min-h-[400px]">
                <h2 className="font-bold text-surface-900 font-display mb-5 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-brand-600" />
                  Available Time Slots
                </h2>

                {loadingSlots ? (
                  <div className="flex flex-col items-center justify-center py-20 opacity-50">
                    <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-2" />
                    <p className="text-sm font-medium">Loading slots...</p>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="text-center py-20">
                    <p className="text-surface-500 font-medium">No slots available at the moment.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {availableSlots.map(day => (
                      <div key={day.date}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-sm font-bold text-surface-900">{day.date}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {day.slots.map((slot: any) => (
                            <button
                              key={slot.id}
                              disabled={!slot.available}
                              onClick={() => setSelectedSlot(slot.id)}
                              className={`py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                                !slot.available
                                  ? 'bg-surface-50 text-surface-300 border-surface-100 cursor-not-allowed'
                                  : selectedSlot === slot.id
                                    ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                                    : 'bg-white text-surface-800 border-surface-200 hover:border-brand-300 hover:bg-brand-50'
                              }`}
                            >
                              <span className="flex items-center justify-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                {slot.time}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar — Summary & Tips */}
              <div className="space-y-4">
                {/* Selected Slot Summary */}
                <div className="bg-white rounded-3xl border border-surface-100 shadow-card p-5">
                  <h3 className="font-bold text-surface-900 font-display mb-3">Your Interview</h3>
                  {selectedSlot && details ? (
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-surface-700 font-medium">Role</span>
                        <span className="font-semibold text-surface-900 text-right text-xs">{appData?.jobs?.title || 'Reviewing Role'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-surface-600">Date</span>
                        <span className="font-semibold text-surface-900">{details.date}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-surface-600">Time</span>
                        <span className="font-semibold text-surface-900">{details.time} IST</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-surface-600">Duration</span>
                        <span className="font-semibold text-surface-900">~45 minutes</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-surface-600">Format</span>
                        <span className="font-semibold text-surface-900">AI Video + Voice</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-surface-600 font-medium mb-4 italic">Select a time slot to continue.</p>
                  )}

                  <button
                    onClick={handleConfirm}
                    disabled={!selectedSlot || confirming}
                    className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
                  >
                    {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {confirming ? 'Confirming...' : 'Confirm Slot'}
                  </button>
                </div>

                {/* Prep Tips */}
                <div className="bg-white rounded-3xl border border-surface-100 shadow-card p-5">
                  <h3 className="font-bold text-surface-900 font-display mb-3">📋 Preparation Tips</h3>
                  <ul className="space-y-2">
                    {[
                      { icon: Video, tip: 'Test your camera & mic beforehand' },
                      { icon: Wifi, tip: 'Use a stable WiFi connection' },
                      { icon: Mic, tip: 'Find a quiet, well-lit space' },
                      { icon: CheckCircle, tip: 'Review the job description once' },
                    ].map(({ icon: Icon, tip }) => (
                      <li key={tip} className="flex items-start gap-2.5 text-xs text-surface-700">
                        <div className="w-5 h-5 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Icon className="w-3 h-3 text-brand-600" />
                        </div>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Confirmation Screen */
          <div className="max-w-lg mx-auto text-center animate-scale-in py-10">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-3xl font-bold font-display text-surface-900 mb-3">Interview Confirmed! 🎉</h2>
            <p className="text-surface-700 font-medium mb-6">
              Your interview is scheduled for <strong className="text-surface-900">{new Date(bookingDetails?.scheduled_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</strong>. A calendar invite has been sent to your email.
            </p>

            <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5 mb-6 text-left">
              <h3 className="font-semibold text-surface-900 mb-3">Your Interview Link</h3>
              <div className="bg-surface-50 rounded-xl p-3 font-mono text-xs text-brand-700 break-all border border-brand-200 font-medium group relative overflow-hidden">
                 <div className="absolute inset-x-0 h-[2px] bottom-0 bg-brand-500/10 animate-pulse"></div>
                 {typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}${bookingDetails?.unique_link}` : bookingDetails?.unique_link}
              </div>
              <p className="text-xs text-surface-600 font-medium mt-2">This link is valid for 2 hours after your scheduled time.</p>
            </div>

            <div className="flex gap-3 justify-center">
              <Link href={bookingDetails?.unique_link || '#'}
                className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-brand-100">
                <Video className="w-4 h-4" /> Join Interview Room
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-surface-500 flex flex-col items-center gap-4"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /> Loading schedule...</div>}>
      <ScheduleContent />
    </Suspense>
  )
}
