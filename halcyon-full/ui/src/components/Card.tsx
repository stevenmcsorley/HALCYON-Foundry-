import React from 'react'

interface CardProps {
  title?: string
  children: React.ReactNode
  className?: string
  header?: React.ReactNode
  fill?: boolean
  bodyClassName?: string
}

export const Card: React.FC<CardProps> = ({
  title,
  children,
  className = '',
  header,
  fill = true,
  bodyClassName = ''
}) => (
  <div
    className={`bg-panel rounded-xl border border-white/10 flex flex-col ${
      fill ? 'h-full min-h-0' : ''
    } ${className}`.trim()}
  >
    {(title || header) && (
      <div className="px-3 py-2 border-b border-white/10 text-sm opacity-80 flex-shrink-0 flex items-center justify-between">
        <span className="font-medium text-white/80">{title}</span>
        {header}
      </div>
    )}
    <div
      className={`${fill ? 'flex-1 min-h-0' : ''} flex flex-col relative ${bodyClassName}`.trim()}
    >
      {children}
    </div>
  </div>
)
