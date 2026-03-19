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
              Socket Test Project
            </Link>
          </div>
          <nav className="flex items-center gap-4">
            <Link to="/" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
              Home
            </Link>
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  Get Started
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}
