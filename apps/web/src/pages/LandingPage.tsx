import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { NavBar } from '@/components/landing/NavBar'
import { HeroSection } from '@/components/landing/HeroSection'
import { HeroShowcaseSection } from '@/components/landing/HeroShowcaseSection'
import { HowItWorksSection } from '@/components/landing/HowItWorksSection'
import { FeaturesSection } from '@/components/landing/FeaturesSection'
import { TestimonialsSection } from '@/components/landing/TestimonialsSection'
import { CtaSection } from '@/components/landing/CtaSection'
import { FooterSection } from '@/components/landing/FooterSection'

export default function LandingPage() {
  const navigate = useNavigate()

  // Add landing-page class to body to enable scrolling (overrides overflow:hidden)
  useEffect(() => {
    document.body.classList.add('landing-page')
    return () => {
      document.body.classList.remove('landing-page')
    }
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#000000' }}>
      <NavBar />
      <main>
        <HeroSection />
        <HeroShowcaseSection
          onCtaClick={() => navigate('/auth?mode=register')}
        />
        <HowItWorksSection />
        <FeaturesSection />
        <TestimonialsSection />
        <CtaSection />
      </main>
      <FooterSection />
    </div>
  )
}
