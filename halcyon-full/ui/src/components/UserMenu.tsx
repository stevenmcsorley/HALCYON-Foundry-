import React from 'react'
import { useAuthStore } from '@/store/authStore'

export default function UserMenu() {
  const { user, logout } = useAuthStore()

  if (!user) return null

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm opacity-80">
        <div className="font-medium">{user.email || user.sub}</div>
        <div className="text-xs opacity-60">{user.roles.join(', ')}</div>
      </div>
      <button
        onClick={logout}
        className="px-3 py-1 text-sm bg-white/10 hover:bg-white/20 rounded transition-colors"
      >
        Logout
      </button>
    </div>
  )
}
