import React from 'react'
import { MapPanel } from './modules/map'
import { GraphPanel } from './modules/graph'
import { ListPanel } from './modules/list'
import { TimelinePanel } from './modules/timeline'

export default function App() {
  return (
    <div className="min-h-screen bg-surface text-white">
      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h1 className="text-xl font-semibold">HALCYON Console</h1>
        <div className="text-sm text-muted">Config-driven • Ontology-first</div>
      </header>
      <main className="grid grid-cols-12 gap-3 p-3">
        <section className="col-span-4 bg-panel rounded-xl p-3"><ListPanel /></section>
        <section className="col-span-8 bg-panel rounded-xl p-3"><MapPanel /></section>
        <section className="col-span-6 bg-panel rounded-xl p-3"><GraphPanel /></section>
        <section className="col-span-6 bg-panel rounded-xl p-3"><TimelinePanel /></section>
      </main>
    </div>
  )
}
