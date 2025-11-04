import { create } from 'zustand'
import * as auth from '@/services/auth'

type AuthState = {
  token: string | null
  user: auth.User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  initialize: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  loading: false,
  login: async (username: string, password: string) => {
    set({ loading: true })
    try {
      const { token, user } = await auth.login(username, password)
      set({ token, user, loading: false })
    } catch (error) {
      set({ loading: false })
      throw error
    }
  },
  logout: () => {
    auth.logout()
    set({ token: null, user: null })
  },
  initialize: () => {
    const token = auth.getToken()
    const user = auth.getUser()
    set({ token, user })
  },
}))
