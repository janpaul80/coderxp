import React, { useEffect } from 'react'
import { NavBar } from '@/components/landing/NavBar'
import { HeroSection } from '@/components/landing/HeroSection'
import { FeaturesSection } from '@/components/landing/FeaturesSection'
import { TestimonialsSection } from '@/components/landing/TestimonialsSection'
import { FooterSection } from '@/components/landing/FooterSection'

export default function LandingPage() {
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
        <FeaturesSection />
        <TestimonialsSection />
      </main>
      <FooterSection />
    </div>
  )
}
