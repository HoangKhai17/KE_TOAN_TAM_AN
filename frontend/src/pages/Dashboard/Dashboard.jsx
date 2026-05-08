import { useAuthStore } from '../../stores/authStore'
import AppLayout from '../../components/layout/AppLayout'
import s from './Dashboard.module.css'

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)

  return (
    <AppLayout title="Dashboard">
      {/* Greeting */}
      <div className={s.greeting}>
        <h2 className={s.greetingTitle}>
          Xin chào, {user?.name?.split(' ').pop() ?? 'bạn'} 👋
        </h2>
        <p className={s.greetingDate}>
          Hôm nay {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className={s.statsGrid}>
        {STAT_CARDS.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Placeholder content */}
      <div className={s.contentGrid}>
        <PlaceholderPanel title="Công việc gần đây" rows={5} />
        <PlaceholderPanel title="Sắp đến hạn" rows={4} />
      </div>
    </AppLayout>
  )
}

/* ── Sub-components ─────────────────────────────────── */

const STAT_CARDS = [
  { label: 'Khách hàng',       value: '—', sub: 'công ty đang hoạt động', color: '#0f345e', bg: '#eef3fa' },
  { label: 'Công việc mở',     value: '—', sub: 'cần xử lý',              color: '#1d6f42', bg: '#ecfdf5' },
  { label: 'Quá hạn',          value: '—', sub: 'cần ưu tiên',            color: '#b91c1c', bg: '#fef2f2' },
  { label: 'Hoàn thành hôm nay',value: '—', sub: 'tốt lắm!',             color: '#d4a440', bg: '#fefce8' },
]

function StatCard({ label, value, sub, color, bg }) {
  return (
    <div
      className={s.statCard}
      style={{ background: bg, borderColor: `${color}22` }}
    >
      <p className={s.statLabel} style={{ color }}>
        {label}
      </p>
      <p className={s.statValue} style={{ color }}>
        {value}
      </p>
      <p className={s.statSub}>{sub}</p>
    </div>
  )
}

function PlaceholderPanel({ title, rows }) {
  return (
    <div className={s.panel}>
      <h3 className={s.panelTitle}>{title}</h3>
      <div className={s.skeletonList}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={s.skeletonRow} />
        ))}
      </div>
      <p className={s.panelNote}>
        Sẽ hiển thị dữ liệu sau khi tích hợp API
      </p>
    </div>
  )
}
