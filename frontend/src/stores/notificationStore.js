import { create } from 'zustand'

export const useNotificationStore = create((set, get) => ({
  unreadCount: 0,
  recent: [],       // last 10 notifications for dropdown
  hasLoaded: false,

  setUnreadCount: (count) => set({ unreadCount: count }),

  setRecent: (notifications) => set({ recent: notifications, hasLoaded: true }),

  addNew: (notification) => set((state) => ({
    unreadCount: state.unreadCount + 1,
    recent: [notification, ...state.recent].slice(0, 10),
  })),

  markOneRead: (id) => set((state) => ({
    unreadCount: Math.max(0, state.unreadCount - (
      state.recent.find((n) => n.id === id && !n.is_read) ? 1 : 0
    )),
    recent: state.recent.map((n) =>
      n.id === id ? { ...n, is_read: true } : n
    ),
  })),

  markAllRead: () => set((state) => ({
    unreadCount: 0,
    recent: state.recent.map((n) => ({ ...n, is_read: true })),
  })),

  reset: () => set({ unreadCount: 0, recent: [], hasLoaded: false }),
}))
