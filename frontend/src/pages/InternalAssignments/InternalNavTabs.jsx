import { NavLink } from 'react-router-dom'
import { ClipboardCheck, ListChecks, BookMarked } from 'lucide-react'
import s from './InternalNavTabs.module.css'

// Điều hướng chéo (segmented): Nội bộ ↔ Công việc ↔ Tài liệu nội bộ
export default function InternalNavTabs({ actions = null }) {
  const cls = ({ isActive }) => `${s.tab} ${isActive ? s.tabActive : ''}`
  return (
    <div className={s.tabs}>
      <div className={s.tabLinks}>
        <NavLink to="/internal-assignments" end className={cls}>
          <ClipboardCheck size={13} /> Nội bộ
        </NavLink>
        <NavLink to="/tasks" className={cls}>
          <ListChecks size={13} /> Công việc
        </NavLink>
        <NavLink to="/internal-assignments/documents" className={cls}>
          <BookMarked size={13} /> Tài liệu nội bộ
        </NavLink>
      </div>
      {actions && <div className={s.tabActions}>{actions}</div>}
    </div>
  )
}
