import { useAuthStore } from '../../stores/authStore'
import AppLayout from '../../components/layout/AppLayout'

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)

  return (
    <AppLayout title="Dashboard">
      {/* Greeting */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">
          Xin chào, {user?.name?.split(' ').pop() ?? 'bạn'} 👋
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Hôm nay {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {STAT_CARDS.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Placeholder content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
      className="rounded-xl p-5 border"
      style={{ background: bg, borderColor: `${color}22` }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color }}>
        {label}
      </p>
      <p className="text-3xl font-bold mb-1" style={{ color }}>
        {value}
      </p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  )
}

function PlaceholderPanel({ title, rows }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center mt-4">
        Sẽ hiển thị dữ liệu sau khi tích hợp API
      </p>
    </div>
  )
}
