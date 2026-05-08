import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { login } from '../../api/auth'
import s from './Login.module.css'

export default function Login() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore((state) => state.setAuth)

  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showPw,     setShowPw]     = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await login({ email: email.trim(), password })
      setAuth(data.user, data.accessToken)
      if (data.user.mustChangePw) {
        navigate('/change-password', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.page}>
      {/* ── Background layers ── */}
      <div className={s.bgLayer} />
      <div className={s.bgGrid} />
      <div className={`${s.shape} ${s.s1}`} />
      <div className={`${s.shape} ${s.s2}`} />
      <div className={`${s.shape} ${s.s3}`} />

      {/* ── Topbar ── */}
      <div className={s.topbar}>
        <div className={s.tag}>taman-saigon-internal · v1.0.3</div>
        <div className={s.env}>NỘI BỘ</div>
      </div>

      {/* ── Login shell ── */}
      <section className={s.loginShell} aria-label="Đăng nhập hệ thống">

        {/* ── Brand panel (left) ── */}
        <div className={s.brandPanel}>
          <div className={s.brandMark}>
            <img src="/logo_taman2.png" alt="Logo Kế toán Tâm An Sài Gòn" />
          </div>
          <div>
            <p className={s.eyebrow}>Dịch vụ kế toán Tâm An Sài Gòn</p>
            <h1>Phần mềm quản lý nội bộ</h1>
            <p>
              Theo dõi khách hàng, công việc kế toán, hồ sơ chứng từ, deadline và báo
              cáo vận hành trong một hệ thống bảo mật.
            </p>
          </div>
          <div className={s.trustList}>
            <span>Quản lý công việc</span>
            <span>Kiểm soát deadline</span>
            <span>Hồ sơ khách hàng</span>
          </div>
        </div>

        {/* ── Card (right) ── */}
        <div className={s.card}>

          {/* Brand header */}
          <div className={s.brand}>
            <div className={s.logoWrap}>
              <img src="/logo_taman2.png" alt="Logo Tâm An" />
            </div>
            <div className={s.brandText}>
              <div className={s.system}>Internal System</div>
              <div className={s.company}>Kế toán Tâm An <span>Sài Gòn</span></div>
            </div>
          </div>

          {/* Heading */}
          <div className={s.heading}>
            <h2>Đăng nhập hệ thống</h2>
            <p>Sử dụng tài khoản nội bộ để truy cập phần mềm quản lý vận hành của Tâm An.</p>
          </div>

          {/* Error message */}
          {error && (
            <div className={s.errorMsg} role="alert">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {/* Form */}
          <form className={s.form} onSubmit={handleSubmit} noValidate>
            <div className={s.field}>
              <label htmlFor="email">Email đăng nhập</label>
              <div className={s.input}>
                <span className={s.prefix} aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M20 21a8 8 0 1 0-16 0" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  id="email"
                  type="email"
                  placeholder="vd: admin@tamansaigon.vn"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className={s.field}>
              <label htmlFor="password">Mật khẩu</label>
              <div className={s.input}>
                <span className={s.prefix} aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </span>
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  className={s.suffix}
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPw ? 'ẨN' : 'HIỆN'}
                </button>
              </div>
            </div>

            <div className={s.rowBetween}>
              <label
                className={s.remember}
                onClick={() => setRememberMe((v) => !v)}
              >
                <span className={`${s.check} ${rememberMe ? s.on : ''}`}>
                  {rememberMe ? '✓' : ''}
                </span>
                Ghi nhớ đăng nhập
              </label>
              <a href="#" className={s.forgot}>Quên mật khẩu?</a>
            </div>

            <button
              type="submit"
              className={s.cta}
              disabled={loading || !email.trim() || !password}
            >
              {loading ? (
                <>
                  <SpinnerIcon />
                  Đang đăng nhập…
                </>
              ) : (
                <>
                  Đăng nhập
                  <svg
                    className={s.arrow}
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className={s.divider}>Bảo mật nội bộ</div>

          {/* Helper card */}
          <div className={s.helperCard}>
            <svg
              className={s.lock}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <div className={s.text}>
              <b>Chỉ dành cho nhân sự nội bộ.</b>
              <br />
              Chưa có tài khoản? Liên hệ quản trị viên tại{' '}
              <a href="mailto:admin@tamansaigon.vn">admin@tamansaigon.vn</a>
            </div>
          </div>

          {/* Card footer */}
          <div className={s.cardFoot}>
            <span>© 2026 Kế toán Tâm An Sài Gòn</span>
            <span className={s.version}>Version 1.0.3</span>
          </div>
        </div>
      </section>

      {/* ── Page footer ── */}
      <div className={s.pageFoot}>
        TÂM AN SÀI GÒN <span className={s.sep}>·</span> Hệ thống quản lý nội bộ
        <span className={s.sep}>·</span> Version 1.0.3
      </div>
    </div>
  )
}

/* ── Spinner icon ───────────────────────────── */
function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ animation: 'login-spin 0.75s linear infinite', flexShrink: 0 }}
      aria-hidden="true"
    >
      <style>{`@keyframes login-spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
