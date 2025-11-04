import React, { useMemo } from 'react'

interface TopBarPanelProps {
  data: any
  config?: {
    sourcePath?: string // e.g., "data.entities"
    labelKey?: string // e.g., "type"
    valueMode?: 'count' | 'sum' | 'avg'
    valueKey?: string // for sum/avg modes
    limit?: number
  }
}

export const TopBarPanel: React.FC<TopBarPanelProps> = ({ data, config }) => {
  const items = useMemo(() => {
    // If data already has items array, use it
    if (data?.items && Array.isArray(data.items)) {
      return data.items.map((item: any) => ({
        label: String(item.label || item.name || 'Unknown'),
        value: typeof item.value === 'number' ? item.value : 0
      }))
    }

    // Extract source array
    let sourceArray: any[] = []
    if (config?.sourcePath) {
      const parts = config.sourcePath.split('.')
      let current: any = data
      for (const part of parts) {
        current = current?.[part]
      }
      if (Array.isArray(current)) {
        sourceArray = current
      }
    } else if (Array.isArray(data)) {
      sourceArray = data
    } else if (Array.isArray(data?.entities)) {
      sourceArray = data.entities
    } else if (Array.isArray(data?.relationships)) {
      sourceArray = data.relationships
    }

    if (sourceArray.length === 0) return []

    // Aggregate by labelKey
    const labelKey = config?.labelKey || 'type'
    const valueMode = config?.valueMode || 'count'
    const valueKey = config?.valueKey

    const counts = new Map<string, number>()

    for (const item of sourceArray) {
      const label = String(item[labelKey] || item.type || 'Unknown')
      
      if (valueMode === 'count') {
        counts.set(label, (counts.get(label) || 0) + 1)
      } else if (valueKey) {
        const val = typeof item[valueKey] === 'number' ? item[valueKey] : 0
        if (valueMode === 'sum') {
          counts.set(label, (counts.get(label) || 0) + val)
        } else if (valueMode === 'avg') {
          // For avg, we'll need to track count too
          const current = counts.get(label) || 0
          counts.set(label, current + val)
        }
      }
    }

    // Convert to array and sort
    let result = Array.from(counts.entries()).map(([label, value]) => ({
      label,
      value: valueMode === 'avg' ? value / sourceArray.filter(item => String(item[labelKey] || item.type || 'Unknown') === label).length : value
    }))

    result.sort((a, b) => b.value - a.value)

    const limit = config?.limit || 10
    return result.slice(0, limit)
  }, [data, config])

  if (items.length === 0) {
    return <div className="text-sm text-white/70 p-4">No data to display</div>
  }

  const maxValue = Math.max(...items.map(i => i.value))

  return (
    <div className="flex flex-col gap-2 p-3">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div className="text-xs text-white/80 w-24 truncate" title={item.label}>
            {item.label}
          </div>
          <div className="flex-1 relative">
            <div
              className="h-6 bg-teal-600 rounded transition-all"
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
          <div className="text-xs text-white/90 w-16 text-right">
            {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
          </div>
        </div>
      ))}
    </div>
  )
}
