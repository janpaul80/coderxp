import React from 'react'
import { Link } from 'react-router-dom'

export function Home() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <h1 className="text-5xl font-bold text-gray-900 mb-6">
        D-Concurrent-1
      </h1>
      <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
        Phase6 concurrent guard test plan
      </p>

      <div className="flex gap-4 justify-center mb-16">
        <Link
          to="/register"
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg text-lg font-semibold"
        >
          Get Started
        </Link>
        <Link
          to="/login"
          className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-8 py-3 rounded-lg text-lg font-semibold"
        >
          Sign In
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-8 text-left max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Features</h2>
        <ul className="space-y-3 text-gray-700">
        <li className="flex items-center gap-2">
          <span className="text-green-500">✓</span>
          <span>feature1</span>
        </li>
        </ul>
      </div>
    </div>
  )
}
