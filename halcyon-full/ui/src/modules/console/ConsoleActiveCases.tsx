import React from 'react'

interface CaseSummary {
  id: number
  title: string
  status: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  owner?: string | null
  updatedAt: string
}

interface ConsoleActiveCasesProps {
  cases: CaseSummary[]
}

const PRIORITY_WEIGHT: Record<CaseSummary['priority'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

const PRIORITY_CLASS: Record<CaseSummary['priority'], string> = {
  critical: 'text-purple-300 bg-purple-500/10 border border-purple-500/30',
  high: 'text-red-300 bg-red-500/10 border border-red-500/30',
  medium: 'text-yellow-300 bg-yellow-500/10 border border-yellow-500/30',
  low: 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/20',
}

export function ConsoleActiveCases({ cases }: ConsoleActiveCasesProps): JSX.Element {
  const sorted = React.useMemo(() => {
    return [...cases]
      .filter((item) => item.status === 'open' || item.status === 'in_progress')
      .sort((a, b) => {
        const priorityDelta = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
        if (priorityDelta !== 0) return priorityDelta
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
      .slice(0, 5)
  }, [cases])

  if (sorted.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-white mb-2">Active Cases</h4>
        <p className="text-xs text-white/50">No active cases right now.</p>
      </div>
    )
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">Active Cases</h4>
        <span className="text-[11px] text-white/40">Top {sorted.length} by priority</span>
      </div>
      <ul className="space-y-2">
        {sorted.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-white truncate max-w-[18rem]" title={item.title}>
                #{item.id} · {item.title}
              </div>
              <div className="text-[11px] text-white/40">
                Owner: {item.owner || 'Unassigned'} · Updated {new Date(item.updatedAt).toLocaleString()}
              </div>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${PRIORITY_CLASS[item.priority]}`}>
              {item.priority.toUpperCase()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
