import React from 'react'
import type { PanelType } from '@/store/savedStore'

const items: { type: PanelType; title: string; desc: string }[] = [
  { type: 'map', title: 'Map', desc: 'Geospatial markers' },
  { type: 'graph', title: 'Graph', desc: 'Entity relationships' },
  { type: 'list', title: 'List', desc: 'Tabular entity listing' },
  { type: 'timeline', title: 'Timeline', desc: 'Time buckets & playback' },
  { type: 'metric', title: 'Metric', desc: 'Single numeric KPI' },
  { type: 'table', title: 'Table', desc: 'Sortable table view' },
  { type: 'topbar', title: 'Top-N Bars', desc: 'Categorical metrics' },
  { type: 'geoheat', title: 'Geo Heat', desc: 'Spatial density map' },
]

interface PanelLibraryProps {
  onPick: (t: PanelType) => void
  variant?: 'grid' | 'single-column'
}

export default function PanelLibrary({ onPick, variant = 'grid' }: PanelLibraryProps) {
  const isColumn = variant === 'single-column'
  return (
    <div className={isColumn ? 'space-y-2' : 'grid grid-cols-4 gap-2'}>
      {items.map((i) => (
        <button
          key={i.type}
          className={`bg-black/20 rounded p-3 text-left hover:bg-white/5 text-white ${
            isColumn ? 'w-full' : ''
          }`}
          onClick={() => onPick(i.type)}
        >
          <div className="font-semibold">{i.title}</div>
          <div className="text-xs opacity-70">{i.desc}</div>
        </button>
      ))}
    </div>
  )
}
