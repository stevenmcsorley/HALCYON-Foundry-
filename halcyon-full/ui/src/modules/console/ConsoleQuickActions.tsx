import React from 'react'
import { useNavigate } from 'react-router-dom'

interface ConsoleQuickActionsProps {
  onTriggerPlaybook?: () => void
}

export function ConsoleQuickActions({ onTriggerPlaybook }: ConsoleQuickActionsProps): JSX.Element {
  const navigate = useNavigate()

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex flex-wrap gap-2">
      <button
        className="px-3 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-500 rounded text-white"
        onClick={() => navigate('/alerts')}
      >
        View Alerts
      </button>
      <button
        className="px-3 py-2 text-sm font-medium bg-sky-600 hover:bg-sky-500 rounded text-white"
        onClick={() => navigate('/cases')}
      >
        View Cases
      </button>
      <button
        className="px-3 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-500 rounded text-white"
        onClick={() => navigate('/dashboards')}
      >
        Open Dashboards
      </button>
      <button
        className="px-3 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500 rounded text-white"
        onClick={() => navigate('/saved')}
      >
        Saved Queries
      </button>
      <button
        className="px-3 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 rounded text-white"
        onClick={() => navigate('/playbooks')}
      >
        Playbook Studio
      </button>
      {onTriggerPlaybook && (
        <button
          className="px-3 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded text-white"
          onClick={onTriggerPlaybook}
        >
          Trigger Playbook
        </button>
      )}
    </div>
  )
}
