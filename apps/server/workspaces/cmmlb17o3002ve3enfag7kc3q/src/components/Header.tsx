import React from 'react'
import { Link, useNavigate } from 'react-router-dom'

interface HeaderProps {
  isAuthenticated?: boolean
  onLogout?: () => void
}

export function Header({ isAuthenticated = false, onLogout }: HeaderProps) {
  const navigate = useNavigate()

  const handleLogout = () => {
    if (onLogout) onLogout()
    navigate('/')
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link to="/" className="text-xl font-bold text-gray-900">
              D-Concurrent-1
            </Link>
          </div>
          <nav className="flex items-center gap-4">
            <Link to="/" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
              Home
            </Link>

          </nav>
        </div>
      </div>
    </header>
  )
}
