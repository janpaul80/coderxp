import React, { useState } from 'react'
import { X, Check, Loader2, Key } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

const API_BASE = ((import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001')

interface CreditsModalProps {
  open: boolean
  onClose: () => void
}

const UPGRADE_FEATURES = [
  'User roles & permissions',
  'Custom domains',
  'Remove the branding badge',
  'Downgrade anytime',
  'Credits rollover',
]

export function CreditsModal({ open, onClose }: CreditsModalProps) {
  const token = useAuthStore((s) => s.token)
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro'>('basic')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const price = selectedPlan === 'basic' ? 9 : 25
  const stripePriceId = selectedPlan === 'basic' ? 'price_basic_monthly' : 'price_pro_monthly'

  async function handleCheckout() {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/billing/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId: stripePriceId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Checkout failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-[400px] bg-[#1D1D1D] rounded-2xl shadow-xl flex flex-col font-sans overflow-hidden border border-white/[0.04]">
          
          <div className="p-6 pb-2">
            <h2 className="text-xl font-bold text-white mb-2">Upgrade your plan</h2>
            <p className="text-sm text-white/50">
              You've used today's free credits. Upgrade to keep building.
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-[#242424] border border-white/[0.04] rounded-xl p-5">
              <p className="text-sm font-semibold text-white/80 mb-2">Upgrade Fee</p>
              <div className="flex items-baseline gap-1.5 mb-4">
                <span className="text-4xl font-bold text-white">${price}</span>
                <span className="text-sm font-medium text-white/50">per month</span>
              </div>
              
              <div className="relative">
                <select
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value as 'basic' | 'pro')}
                  className="w-full appearance-none bg-[#1A1A1A] border border-white/[0.08] rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors hover:border-white/[0.12] focus:outline-none focus:border-white/20"
                >
                  <option value="basic">Basic Plan ($9 / month)</option>
                  <option value="pro">Pro Plan ($25 / month)</option>
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-[#242424] border border-white/[0.04] rounded-xl p-5">
              <p className="text-sm font-semibold text-[#8ebff3] mb-4">You will unlock:</p>
              <div className="space-y-3">
                {UPGRADE_FEATURES.map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-white shrink-0" />
                    <span className="text-sm text-white/80">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 pt-2 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-lg text-sm font-semibold text-white bg-[#2A2A2A] hover:bg-[#333333] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCheckout}
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-lg text-sm font-semibold text-black bg-white hover:bg-[#e8e8e8] transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upgrade'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
