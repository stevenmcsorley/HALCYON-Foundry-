import React from 'react'

export const Card: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-panel rounded-xl border border-white/10">
    <div className="px-3 py-2 border-b border-white/10 text-sm opacity-80">{title}</div>
    <div className="p-3">{children}</div>
  </div>
)
