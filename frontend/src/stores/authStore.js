import { create } from 'zustand'

// Ghi nhớ ai là người đăng nhập gần nhất TRONG TAB NÀY.
const LAST_USER_KEY = 'ktta_last_user_id'

// Các tùy chọn giao diện (bộ lọc, cột hiển thị, tab đang xem, vị trí cuộn…) được lưu
// trong sessionStorage với key CHUNG, không gắn theo user. Vì vậy khi đổi tài khoản
// trong cùng một tab, người sau sẽ kế thừa — và ghi đè — thiết lập của người trước.
// → Khi phát hiện NGƯỜI KHÁC đăng nhập thì xoá sạch. Cùng người thì giữ nguyên.
const KEEP_KEYS = new Set([
  'sidebar_open',   // không thuộc về người dùng cụ thể
  LAST_USER_KEY,
])

function clearUserScopedPrefs() {
  try {
    const toRemove = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && !KEEP_KEYS.has(k)) toRemove.push(k)
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k))
  } catch { /* storage bị chặn — bỏ qua */ }
}

export const useAuthStore = create((set) => ({
  user:            null,
  accessToken:     null,
  isAuthenticated: false,
  isAuthReady:     false,   // true once bootstrap (cookie check) is done

  setAuth: (user, accessToken) => {
    try {
      const lastUserId = sessionStorage.getItem(LAST_USER_KEY)
      if (user?.id && lastUserId && lastUserId !== user.id) {
        clearUserScopedPrefs()   // đổi sang tài khoản khác → không kế thừa thiết lập cũ
      }
      if (user?.id) sessionStorage.setItem(LAST_USER_KEY, user.id)
    } catch { /* storage bị chặn — bỏ qua */ }
    set({ user, accessToken, isAuthenticated: true })
  },

  setAccessToken: (accessToken) =>
    set({ accessToken }),

  setAuthReady: () =>
    set({ isAuthReady: true }),

  patchUser: (updates) =>
    set((state) => ({ user: state.user ? { ...state.user, ...updates } : state.user })),

  logout: () =>
    set({ user: null, accessToken: null, isAuthenticated: false }),
}))
