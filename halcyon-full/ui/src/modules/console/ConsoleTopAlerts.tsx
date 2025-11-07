import React from 'react'

interface AlertSummary {
  id: number
  message: string
  severity: 'low' | 'medium' | 'high'
  status: string
  createdAt?: string
  created_at?: string
  ruleId?: number
}

interface ConsoleTopAlertsProps {
  alerts: AlertSummary[]
}

const SEVERITY_WEIGHT: Record<AlertSummary['severity'], number> = {
  high: 3,
  medium: 2,
  low: 1,
}

const SEVERITY_CLASS: Record<AlertSummary['severity'], string> = {
  high: 'text-red-300 bg-red-500/10 border border-red-500/30',
  medium: 'text-yellow-300 bg-yellow-500/10 border border-yellow-500/30',
  low: 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/20',
}

export function ConsoleTopAlerts({ alerts }: ConsoleTopAlertsProps): JSX.Element {
  const sorted = React.useMemo(() => {
    return [...alerts]
      .filter((alert) => alert.status === 'open')
      .sort((a, b) => {
        const severityDelta = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]
        if (severityDelta !== 0) return severityDelta
        const dateB = new Date(b.createdAt ?? b.created_at ?? '').getTime()
        const dateA = new Date(a.createdAt ?? a.created_at ?? '').getTime()
        return dateB - dateA
      })
      .slice(0, 5)
  }, [alerts])

  if (sorted.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-4"> 
        <h4 className="text-sm font-semibold text-white mb-2">Open Alerts</h4>
        <p className="text-xs text-white/50">No open alerts right now.</p>
      </div>
    )
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">Open Alerts</h4>
        <span className="text-[11px] text-white/40">Top {sorted.length} by severity</span>
      </div>
      <ul className="space-y-2">
        {sorted.map((alert) => (
          <li key={alert.id} className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-white truncate max-w-[18rem]" title={alert.message}>
                #{alert.id} · {alert.message}
              </div>
              <div className="text-[11px] text-white/40">
                {new Date(alert.createdAt ?? alert.created_at ?? '').toLocaleString()} · Status: {alert.status}
              </div>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${SEVERITY_CLASS[alert.severity]}`}>
              {alert.severity.toUpperCase()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
