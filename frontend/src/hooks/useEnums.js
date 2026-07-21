import { create } from 'zustand'
import { fetchAllEnums } from '../api/enums'

let _inflightPromise = null

export const useEnumsStore = create((set, get) => ({
  enums: null,
  loaded: false,

  load: () => {
    if (get().loaded) return Promise.resolve()
    if (_inflightPromise) return _inflightPromise
    _inflightPromise = fetchAllEnums()
      .then((enums) => {
        set({ enums, loaded: true })
      })
      .catch(() => {
        // silently fail — components fall back to hardcoded labels
      })
      .finally(() => {
        _inflightPromise = null
      })
    return _inflightPromise
  },

  invalidate: () => {
    _inflightPromise = null
    set({ enums: null, loaded: false })
  },

  // Returns [{key, label, sortOrder, isActive}] for active options
  getOptions: (typeKey) => {
    const e = get().enums
    if (!e?.[typeKey]) return []
    return e[typeKey].options.filter((o) => o.isActive)
  },

  // Nhóm lựa chọn của danh mục (rỗng nếu danh mục không bật tính năng nhóm)
  getGroups: (typeKey) => {
    const e = get().enums
    return e?.[typeKey]?.groups ?? []
  },

  // Nhãn của một nhóm
  getGroupLabel: (typeKey, groupKey, fallback) => {
    const e = get().enums
    const g = e?.[typeKey]?.groups?.find((x) => x.key === groupKey)
    return g?.label ?? fallback ?? groupKey
  },

  // Returns label string; falls back to fallback or the key itself
  getLabel: (typeKey, optionKey, fallback) => {
    const e = get().enums
    if (!e?.[typeKey]) return fallback ?? optionKey
    const opt = e[typeKey].options.find((o) => o.key === optionKey)
    return opt?.label ?? fallback ?? optionKey
  },

  // Returns plain { key: label } map
  getLabelMap: (typeKey) => {
    const e = get().enums
    if (!e?.[typeKey]) return {}
    return Object.fromEntries(e[typeKey].options.map((o) => [o.key, o.label]))
  },
}))
