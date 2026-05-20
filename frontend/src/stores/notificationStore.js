import { create } from 'zustand'

export const useNotificationStore = create((set) => ({
  unreadCount: 0,
  recent: [],       // last 10 notifications for dropdown
  hasLoaded: false,

  setUnreadCount: (count) => set({ unreadCount: count }),

  setRecent: (notifications) => set((state) => {
    const incomingIds = new Set(notifications.map((n) => n.id))
    const preserved = state.recent.filter((n) => !incomingIds.has(n.id))

    return {
      recent: [...notifications, ...preserved].slice(0, 10),
      hasLoaded: true,
    }
  }),

  addNew: (notification) => set((state) => {
    const existing = state.recent.find((n) => n.id === notification.id)

    if (existing) {
      return {
        unreadCount: state.unreadCount,
        recent: state.recent.map((n) =>
          n.id === notification.id ? { ...n, ...notification } : n
        ),
      }
    }

    return {
      unreadCount: state.unreadCount + (notification.is_read ? 0 : 1),
      recent: [notification, ...state.recent].slice(0, 10),
    }
  }),

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
