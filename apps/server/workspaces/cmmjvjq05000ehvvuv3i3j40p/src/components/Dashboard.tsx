import React from 'react'

export function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-2">A simple todo app with React frontend and Express backend</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        <div key="0" className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">User registration and login</h3>
          <p className="text-gray-500 text-sm">Manage your user registration and login here.</p>
        </div>
        <div key="1" className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Create, read, update, and delete todos</h3>
          <p className="text-gray-500 text-sm">Manage your create, read, update, and delete todos here.</p>
        </div>
        <div key="2" className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Authentication and authorization</h3>
          <p className="text-gray-500 text-sm">Manage your authentication and authorization here.</p>
        </div>
        <div key="3" className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Persistence of todos in a database</h3>
          <p className="text-gray-500 text-sm">Manage your persistence of todos in a database here.</p>
        </div>
      </div>
    </div>
  )
}
