import React, { useEffect, useState } from 'react'
import { MapPanel } from './modules/map'
import { GraphPanel } from './modules/graph'
import { ListPanel } from './modules/list'
import { TimelinePanel } from './modules/timeline'
import EntityInspector from './components/EntityInspector'
import LoginForm from './components/LoginForm'
import UserMenu from './components/UserMenu'
import SavedQueriesPanel from './modules/saved/SavedQueriesPanel'
import DashboardEditor from './modules/dashboards/DashboardEditor'
import { useAuthStore } from './store/authStore'
import * as auth from './services/auth'

// Default to DEV_MODE=true for local development (bypass Keycloak)
const DEV_MODE = import.meta.env.VITE_DEV_MODE === undefined || import.meta.env.VITE_DEV_MODE === 'true' || import.meta.env.VITE_DEV_MODE === '1'

type Tab = 'console' | 'saved' | 'dashboards'

export default function App() {
  const { user, initialize } = useAuthStore()
  const isAuthenticated = user || DEV_MODE || auth.isAuthenticated()
  const [activeTab, setActiveTab] = useState<Tab>('console')

  useEffect(() => {
    initialize()
  }, [initialize])

  // Helper to check if user has a specific role
  const hasRole = (role: string): boolean => {
    if (DEV_MODE) return true // DEV_MODE allows all roles
    if (!user) return false
    return user.roles.includes(role)
  }

  if (!isAuthenticated && !DEV_MODE) {
    return <LoginForm />
  }

  return (
    <div className="min-h-screen bg-surface text-white">
      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h1 className="text-xl font-semibold">HALCYON Console</h1>
        <UserMenu />
      </header>

      <div className="border-b border-white/10 flex gap-2 px-4">
        <button
          className={`px-3 py-2 text-sm font-medium ${
            activeTab === 'console'
              ? 'border-b-2 border-white text-white'
              : 'opacity-70 hover:opacity-100 text-white'
          }`}
          onClick={() => setActiveTab('console')}
        >
          Console
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium ${
            activeTab === 'saved'
              ? 'border-b-2 border-white text-white'
              : 'opacity-70 hover:opacity-100 text-white'
          }`}
          onClick={() => setActiveTab('saved')}
        >
          Saved Queries
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium ${
            activeTab === 'dashboards'
              ? 'border-b-2 border-white text-white'
              : 'opacity-70 hover:opacity-100 text-white'
          }`}
          onClick={() => setActiveTab('dashboards')}
        >
          Dashboards
        </button>
      </div>

      {activeTab === 'console' && (
        <>
          <div className="grid grid-cols-2 h-[calc(100vh-8rem)]">
            <div className="border-r border-white/10">
              <MapPanel />
            </div>
            <div>
              <GraphPanel />
            </div>
          </div>
          
          <div className="grid grid-cols-2 border-t border-white/10 h-[calc(100vh-8rem)]">
            <div className="border-r border-white/10">
              <ListPanel />
            </div>
            <div>
              <TimelinePanel />
            </div>
          </div>

          <EntityInspector />
        </>
      )}

      {activeTab === 'saved' && (
        <div className="h-[calc(100vh-8rem)] overflow-auto">
          <SavedQueriesPanel />
        </div>
      )}

      {activeTab === 'dashboards' && (
        <div className="h-[calc(100vh-8rem)] overflow-auto">
          <DashboardEditor />
        </div>
      )}
      
      {/* Example: Role-based conditional rendering
      {hasRole('admin') && (
        <AdminPanel />
      )}
      */}
    </div>
  )
}
