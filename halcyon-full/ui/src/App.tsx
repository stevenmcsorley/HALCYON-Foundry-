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
import AlertsTab from './modules/alerts/AlertsTab'
import { NotificationBell } from './components/NotificationBell'
import { useAuthStore } from './store/authStore'
import * as auth from './services/auth'
import { Toast, subscribeToToast } from './components/Toast'

type Tab = 'console' | 'saved' | 'dashboards' | 'alerts'

export default function App() {
  const { user, initialize, loading } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('console')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [authInitialized, setAuthInitialized] = useState(false)

  useEffect(() => {
    initialize()
    setAuthInitialized(true)
  }, [initialize])

  const isAuthenticated = authInitialized && (user || auth.isAuthenticated())

  useEffect(() => {
    const unsubscribe = subscribeToToast((message) => {
      setToastMessage(message)
      setTimeout(() => setToastMessage(null), 3000)
    })
    return unsubscribe
  }, [])

  // Helper to check if user has a specific role
  const hasRole = (role: string): boolean => {
    if (!user) return false
    return user.roles.includes(role)
  }

  // Show loading state while auth initializes - MUST be before authentication check
  if (!authInitialized || loading) {
    return (
      <div className="min-h-screen bg-surface text-white flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginForm />
  }

  return (
    <div className="min-h-screen bg-surface text-white">
      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="HALCYON Logo" className="h-8 w-8 object-contain" />
          <h1 className="text-xl font-semibold">HALCYON Console</h1>
        </div>
        <div className="flex items-center gap-4">
          <div
            className="relative cursor-pointer"
            onClick={() => {
              // Clear unread by navigating to Alerts
              setActiveTab('alerts');
            }}
            title="Open Alerts"
          >
            <NotificationBell />
          </div>
          <UserMenu />
        </div>
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
        {(hasRole('analyst') || hasRole('admin')) && (
          <button
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === 'alerts'
                ? 'border-b-2 border-white text-white'
                : 'opacity-70 hover:opacity-100 text-white'
            }`}
            onClick={() => setActiveTab('alerts')}
          >
            Alerts
          </button>
        )}
      </div>

      {activeTab === 'console' && (
        <>
          <div className="grid grid-cols-2 grid-rows-2 h-[calc(100vh-8rem)] gap-4 p-4">
            <div className="border-r border-white/10 pr-4 flex flex-col min-h-0">
              <MapPanel />
            </div>
            <div className="pl-4 flex flex-col min-h-0">
              <GraphPanel />
            </div>
            
            <div className="border-r border-white/10 pr-4 flex flex-col min-h-0 border-t border-white/10 pt-4">
              <ListPanel />
            </div>
            <div className="pl-4 flex flex-col min-h-0 border-t border-white/10 pt-4">
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

      {activeTab === 'alerts' && (hasRole('analyst') || hasRole('admin')) && (
        <div className="h-[calc(100vh-8rem)] overflow-auto">
          <AlertsTab />
        </div>
      )}
      
      {/* Example: Role-based conditional rendering
      {hasRole('admin') && (
        <AdminPanel />
      )}
      */}
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </div>
  )
}
