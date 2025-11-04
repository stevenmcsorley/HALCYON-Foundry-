import React from 'react'

type DrawerProps = {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

export const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-panel border-l border-white/10 z-50 flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold">Details</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors"
            aria-label="Close drawer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </>
  )
}
