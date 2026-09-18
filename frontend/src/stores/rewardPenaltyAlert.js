import { create } from 'zustand'

// Hàng đợi popup thưởng/phạt vừa được admin duyệt (bắn qua socket). Hiển thị lần lượt.
export const useRpAlertStore = create((set) => ({
  queue: [],
  push: (entry) => set((s) => (s.queue.some((e) => e.id === entry.id) ? s : { queue: [...s.queue, entry] })),
  dismiss: () => set((s) => ({ queue: s.queue.slice(1) })),
}))
