import { NavLink } from 'react-router-dom'
import { ClipboardCheck, BookMarked } from 'lucide-react'
import s from './InternalNavTabs.module.css'

export default function InternalNavTabs() {
  return (
    <div className={s.tabs}>
      <NavLink
        to="/internal-assignments"
        end
        className={({ isActive }) => `${s.tab} ${isActive ? s.tabActive : ''}`}
      >
        <ClipboardCheck size={13} />
        Phiếu giao việc
      </NavLink>
      <NavLink
        to="/internal-assignments/documents"
        className={({ isActive }) => `${s.tab} ${isActive ? s.tabActive : ''}`}
      >
        <BookMarked size={13} />
        Tài liệu nội bộ
      </NavLink>
    </div>
  )
}
