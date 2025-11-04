import React from 'react'

export const Card: React.FC<{ title: string, children: React.ReactNode, className?: string }> = ({ title, children, className = "" }) => (
  <div className={`bg-panel rounded-xl border border-white/10 flex flex-col min-h-0 ${className}`}>
    <div className="px-3 py-2 border-b border-white/10 text-sm opacity-80 flex-shrink-0">{title}</div>
    <div className="p-3 flex-1 min-h-0 overflow-hidden">{children}</div>
  </div>
)
