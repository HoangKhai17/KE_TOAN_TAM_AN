import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  user:            null,
  accessToken:     null,
  isAuthenticated: false,
  isAuthReady:     false,   // true once bootstrap (cookie check) is done

  setAuth: (user, accessToken) =>
    set({ user, accessToken, isAuthenticated: true }),

  setAccessToken: (accessToken) =>
    set({ accessToken }),

  setAuthReady: () =>
    set({ isAuthReady: true }),

  logout: () =>
    set({ user: null, accessToken: null, isAuthenticated: false }),
}))
