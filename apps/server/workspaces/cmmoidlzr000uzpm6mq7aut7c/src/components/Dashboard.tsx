import React from 'react'

export function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-2">Build a responsive landing page with hero section, features, pricing, and contact form with serverless backend</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        <div key="0" className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Responsive landing page with hero section</h3>
          <p className="text-gray-500 text-sm">Manage your responsive landing page with hero section here.</p>
        </div>
        <div key="1" className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Features section with icons</h3>
          <p className="text-gray-500 text-sm">Manage your features section with icons here.</p>
        </div>
        <div key="2" className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Pricing table with three tiers</h3>
          <p className="text-gray-500 text-sm">Manage your pricing table with three tiers here.</p>
        </div>
        <div key="3" className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Contact form with validation</h3>
          <p className="text-gray-500 text-sm">Manage your contact form with validation here.</p>
        </div>
        <div key="4" className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">SEO meta tags and open graph</h3>
          <p className="text-gray-500 text-sm">Manage your seo meta tags and open graph here.</p>
        </div>
        <div key="5" className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Serverless form submission</h3>
          <p className="text-gray-500 text-sm">Manage your serverless form submission here.</p>
        </div>
      </div>
    </div>
  )
}
