import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { login } from '../../api/auth'
import s from './Login.module.css'

// ── Validation ──────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateForm(email, password) {
  const errors = { email: null, password: null }
  if (!email.trim()) {
    errors.email = 'Vui lòng nhập email.'
  } else if (!EMAIL_RE.test(email.trim())) {
    errors.email = 'Email không đúng định dạng.'
  }
  if (!password) {
    errors.password = 'Vui lòng nhập mật khẩu.'
  }
  return errors
}

// ── Backend error parser ────────────────────────────────────────────
// Backend shapes:
//   422 validate  → { success:false, error:{ message, details:[{field,message}] } }
//   4xx/5xx       → { success:false, error:{ message }, requestId }
//   no response   → err.response === undefined

const FIELD_MSG_VI = {
  'Invalid email address': 'Email không đúng định dạng.',
  'Password is required':  'Vui lòng nhập mật khẩu.',
}

function parseApiError(err) {
  if (!err.response) {
    return { global: 'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối hoặc thử lại sau.' }
  }

  const { status, data } = err.response
  const apiError = data?.error
  const message  = typeof apiError?.message === 'string' ? apiError.message : ''
  const details  = Array.isArray(apiError?.details) ? apiError.details : []

  switch (status) {
    case 422: {
      const fields = {}
      details.forEach(({ field, message: msg }) => {
        if (field === 'email' || field === 'password') {
          fields[field] = FIELD_MSG_VI[msg] ?? msg
        }
      })
      return { fields }
    }
    case 401:
      return { global: 'Email hoặc mật khẩu không đúng.' }

    case 403:
      return {
        global:
          'Tài khoản chưa được kích hoạt hoặc đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.',
      }

    case 423: {
      // Backend: "Account locked. Try again in X minute(s)"
      //          "Too many failed attempts. Account locked for 30 minutes"
      const match = message.match(/(\d+)\s*minute/)
      const lockMsg = match
        ? `Tài khoản đang bị khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${match[1]} phút hoặc liên hệ quản trị viên.`
        : 'Tài khoản đang bị khóa do đăng nhập sai quá nhiều lần. Vui lòng liên hệ quản trị viên.'
      return { global: lockMsg }
    }

    case 429:
      return { global: 'Bạn thử đăng nhập quá nhiều lần. Vui lòng chờ ít phút rồi thử lại.' }

    default:
      return { global: 'Đăng nhập thất bại. Vui lòng thử lại sau.' }
  }
}

// ── Component ───────────────────────────────────────────────────────

export default function Login() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore((state) => state.setAuth)

  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  // rememberMe: UI only — backend does not yet support session duration control
  const [rememberMe,  setRememberMe]  = useState(true)
  const [showPw,      setShowPw]      = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [globalError, setGlobalError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({ email: null, password: null })

  function handleEmailChange(e) {
    setEmail(e.target.value)
    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: null }))
    if (globalError)       setGlobalError(null)
  }

  function handlePasswordChange(e) {
    setPassword(e.target.value)
    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: null }))
    if (globalError)          setGlobalError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setGlobalError(null)

    const valErrs = validateForm(email, password)
    if (valErrs.email || valErrs.password) {
      setFieldErrors(valErrs)
      return
    }

    setFieldErrors({ email: null, password: null })
    setLoading(true)

    try {
      const data = await login({ email: email.trim(), password })
      setAuth(data.user, data.accessToken)
      navigate(data.user.mustChangePw ? '/change-password' : '/dashboard', { replace: true })
    } catch (err) {
      const parsed = parseApiError(err)
      if (parsed.fields) {
        setFieldErrors((p) => ({ ...p, ...parsed.fields }))
      } else {
        setGlobalError(parsed.global)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.page}>
      {/* ── Background ── */}
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

        {/* Left: brand panel */}
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

        {/* Right: login card */}
        <div className={s.card}>

          {/* Card brand header */}
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

          {/* Global error banner */}
          {globalError && (
            <div className={s.errorMsg} role="alert" aria-live="polite">
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8"  x2="12"    y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {globalError}
            </div>
          )}

          {/* Form */}
          <form className={s.form} onSubmit={handleSubmit} noValidate>

            {/* Email field */}
            <div className={s.field}>
              <label htmlFor="email">Email đăng nhập</label>
              <div className={`${s.input} ${fieldErrors.email ? s.inputError : ''}`}>
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
                  onChange={handleEmailChange}
                  disabled={loading}
                  aria-invalid={fieldErrors.email ? 'true' : 'false'}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                />
              </div>
              {fieldErrors.email && (
                <p id="email-error" className={s.fieldError} role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password field */}
            <div className={s.field}>
              <label htmlFor="password">Mật khẩu</label>
              <div className={`${s.input} ${fieldErrors.password ? s.inputError : ''}`}>
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
                  onChange={handlePasswordChange}
                  disabled={loading}
                  aria-invalid={fieldErrors.password ? 'true' : 'false'}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
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
              {fieldErrors.password && (
                <p id="password-error" className={s.fieldError} role="alert">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Remember me + forgot */}
            <div className={s.rowBetween}>
              <label className={s.remember} onClick={() => setRememberMe((v) => !v)}>
                <span className={`${s.check} ${rememberMe ? s.on : ''}`}>
                  {rememberMe ? '✓' : ''}
                </span>
                Ghi nhớ đăng nhập
              </label>
              <a href="#" className={s.forgot}>Quên mật khẩu?</a>
            </div>

            {/* Submit */}
            <button type="submit" className={s.cta} disabled={loading}>
              {loading ? (
                <>
                  <SpinnerIcon />
                  Đang đăng nhập…
                </>
              ) : (
                <>
                  Đăng nhập
                  <svg className={s.arrow} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
              width="16" height="16" viewBox="0 0 24 24" fill="none"
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

function SpinnerIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'login-spin 0.75s linear infinite', flexShrink: 0 }}
      aria-hidden="true"
    >
      <style>{`@keyframes login-spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
