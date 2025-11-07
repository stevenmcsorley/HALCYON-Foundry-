import React from 'react'

interface SummaryCard {
  title: string
  value: string
  hint?: string
  accentClass: string
}

interface ConsoleSummaryProps {
  cards: SummaryCard[]
}

export function ConsoleSummary({ cards }: ConsoleSummaryProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex flex-col gap-1"
        >
          <span className="text-xs uppercase tracking-wide text-white/50">{card.title}</span>
          <span className={`text-2xl font-semibold text-white ${card.accentClass}`}>{card.value}</span>
          {card.hint && <span className="text-[11px] text-white/50">{card.hint}</span>}
        </div>
      ))}
    </div>
  )
}
