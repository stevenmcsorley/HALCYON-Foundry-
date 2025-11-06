import React, { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
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
import CasesTab from './modules/cases/CasesTab'
import { NotificationBell } from './components/NotificationBell'
import { useAuthStore } from './store/authStore'
import { useCasesStore } from './store/casesStore'
import * as auth from './services/auth'
import { Toast, subscribeToToast } from './components/Toast'

type Tab = 'console' | 'saved' | 'dashboards' | 'alerts' | 'cases'

function MainLayout() {
  const { user } = useAuthStore()
  const { setSelected, get } = useCasesStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Helper to check if user has a specific role
  const hasRole = (role: string): boolean => {
    if (!user) return false
    return user.roles.includes(role)
  }

  // Get active tab from route
  const getActiveTab = (): Tab => {
    const path = location.pathname
    if (path === '/saved') return 'saved'
    if (path === '/dashboards') return 'dashboards'
    if (path === '/alerts') return 'alerts'
    if (path === '/cases') return 'cases'
    return 'console'
  }

  const activeTab = getActiveTab()

  useEffect(() => {
    const unsubscribe = subscribeToToast((message) => {
      setToastMessage(message)
      setTimeout(() => setToastMessage(null), 3000)
    })
    return unsubscribe
  }, [])

  // Handle navigation events between tabs
  useEffect(() => {
    const handleNavigateToCases = async (e: Event) => {
      const customEvent = e as CustomEvent<{ caseId?: number }>
      navigate('/cases')
      if (customEvent.detail?.caseId) {
        try {
          const caseData = await get(customEvent.detail.caseId)
          setSelected(caseData)
        } catch (err) {
          // Silent error - case might not exist
        }
      }
    }
    const handleNavigateToAlerts = (e: Event) => {
      const customEvent = e as CustomEvent<{ alertId?: number }>
      navigate('/alerts')
      // Could scroll to alert or highlight it if needed
    }

    window.addEventListener('navigate-to-cases', handleNavigateToCases)
    window.addEventListener('navigate-to-alerts', handleNavigateToAlerts)

    return () => {
      window.removeEventListener('navigate-to-cases', handleNavigateToCases)
      window.removeEventListener('navigate-to-alerts', handleNavigateToAlerts)
    }
  }, [get, setSelected, navigate])

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
              navigate('/alerts')
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
          onClick={() => navigate('/')}
        >
          Console
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium ${
            activeTab === 'saved'
              ? 'border-b-2 border-white text-white'
              : 'opacity-70 hover:opacity-100 text-white'
          }`}
          onClick={() => navigate('/saved')}
        >
          Saved Queries
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium ${
            activeTab === 'dashboards'
              ? 'border-b-2 border-white text-white'
              : 'opacity-70 hover:opacity-100 text-white'
          }`}
          onClick={() => navigate('/dashboards')}
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
            onClick={() => navigate('/alerts')}
          >
            Alerts
          </button>
        )}
        {(hasRole('analyst') || hasRole('admin') || hasRole('viewer')) && (
          <button
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === 'cases'
                ? 'border-b-2 border-white text-white'
                : 'opacity-70 hover:opacity-100 text-white'
            }`}
            onClick={() => navigate('/cases')}
          >
            Cases
          </button>
        )}
      </div>

      <Routes>
        <Route
          path="/"
          element={
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
          }
        />
        <Route
          path="/saved"
          element={
            <div className="h-[calc(100vh-8rem)] overflow-auto">
              <SavedQueriesPanel />
            </div>
          }
        />
        <Route
          path="/dashboards"
          element={
            <div className="h-[calc(100vh-8rem)] overflow-auto">
              <DashboardEditor />
            </div>
          }
        />
        <Route
          path="/alerts"
          element={
            (hasRole('analyst') || hasRole('admin')) ? (
              <div className="h-[calc(100vh-8rem)] overflow-auto">
                <AlertsTab />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/cases"
          element={
            (hasRole('analyst') || hasRole('admin') || hasRole('viewer')) ? (
              <div className="h-[calc(100vh-8rem)] overflow-auto">
                <CasesTab />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </div>
  )
}

export default function App() {
  const { user, initialize, loading } = useAuthStore()
  const [authInitialized, setAuthInitialized] = useState(false)

  useEffect(() => {
    initialize()
    setAuthInitialized(true)
  }, [initialize])

  const isAuthenticated = authInitialized && (user || auth.isAuthenticated())

  // Show loading state while auth initializes
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

  return <MainLayout />
}
