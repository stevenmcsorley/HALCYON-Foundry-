import React, { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import EntityInspector from './components/EntityInspector'
import LoginForm from './components/LoginForm'
import UserMenu from './components/UserMenu'
import SavedQueriesPanel from './modules/saved/SavedQueriesPanel'
import DashboardEditor from './modules/dashboards/DashboardEditor'
import AlertsTab from './modules/alerts/AlertsTab'
import CasesTab from './modules/cases/CasesTab'
import { PlaybookStudio } from './modules/playbooks/PlaybookStudio'
import { NotificationBell } from './components/NotificationBell'
import { useAuthStore } from './store/authStore'
import { useCasesStore } from './store/casesStore'
import { useAlertsStore } from './store/alertsStore'
import { useSavedStore } from './store/savedStore'
import { ConsoleSummary } from './modules/console/ConsoleSummary'
import DashboardConsoleView from './modules/dashboards/DashboardConsoleView'
import * as auth from './services/auth'
import { Toast, subscribeToToast } from './components/Toast'

type Tab = 'console' | 'saved' | 'dashboards' | 'alerts' | 'cases' | 'playbooks'

function MainLayout() {
  const { user } = useAuthStore()
  const setSelected = useCasesStore((state) => state.setSelected)
  const fetchCase = useCasesStore((state) => state.get)
  const listCases = useCasesStore((state) => state.list)
  const cases = useCasesStore((state) => state.items)
  const alerts = useAlertsStore((state) => state.alerts)
  const loadAlerts = useAlertsStore((state) => state.load)
  const savedQueries = useSavedStore((state) => state.queries)
  const dashboards = useSavedStore((state) => state.dashboards)
  const loadSavedQueries = useSavedStore((state) => state.loadQueries)
  const loadDashboards = useSavedStore((state) => state.loadDashboards)
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
    if (path === '/playbooks') return 'playbooks'
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

  useEffect(() => {
    loadAlerts().catch(() => undefined)
    listCases({ limit: 100 }).catch(() => undefined)
    loadSavedQueries().catch(() => undefined)
    loadDashboards().catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle navigation events between tabs
  useEffect(() => {
    const handleNavigateToCases = async (e: Event) => {
      const customEvent = e as CustomEvent<{ caseId?: number }>
      navigate('/cases')
      if (customEvent.detail?.caseId) {
        try {
          const caseData = await fetchCase(customEvent.detail.caseId)
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
  }, [fetchCase, setSelected, navigate])

  const openAlerts = alerts.filter((alert) => alert.status === 'open')
  const highSeverityAlerts = openAlerts.filter((alert) => alert.severity === 'high').length
  const activeCases = cases.filter((item) => item.status === 'open' || item.status === 'in_progress')
  const summaryCards = [
    {
      title: 'Open Alerts',
      value: openAlerts.length.toString(),
      hint: `${highSeverityAlerts} high severity`,
      accentClass: 'text-emerald-300',
    },
    {
      title: 'Active Cases',
      value: activeCases.length.toString(),
      hint: `${cases.length} total`,
      accentClass: 'text-sky-300',
    },
    {
      title: 'Dashboards / Queries',
      value: `${dashboards.length} / ${savedQueries.length}`,
      hint: 'curated views & saved queries',
      accentClass: 'text-purple-300',
    },
  ]

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
        {(hasRole('analyst') || hasRole('admin') || hasRole('viewer')) && (
          <button
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === 'playbooks'
                ? 'border-b-2 border-white text-white'
                : 'opacity-70 hover:opacity-100 text-white'
            }`}
            onClick={() => navigate('/playbooks')}
          >
            Playbooks
          </button>
        )}
      </div>

      <Routes>
        <Route
          path="/"
          element={
            <>
              <div className="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
                <div className="p-4 pb-2">
                  <ConsoleSummary cards={summaryCards} />
                </div>
                <div className="flex-1 min-h-0 overflow-auto px-4 pb-4">
                  <div className="min-h-full">
                    <DashboardConsoleView />
                  </div>
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
        <Route
          path="/playbooks"
          element={
            (hasRole('analyst') || hasRole('admin') || hasRole('viewer')) ? (
              <div className="h-[calc(100vh-8rem)] overflow-hidden">
                <PlaybookStudio />
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
