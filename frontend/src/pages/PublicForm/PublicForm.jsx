import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicForm, submitPublicForm } from '../../api/clientRequests'
import s from './publicForm.module.css'

const INIT = { contactName: '', phone: '', description: '', sharedLink: '', notes: '' }

export default function PublicForm() {
  const { token } = useParams()

  const [form,        setForm]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)   // 'not_found' | 'expired' | 'already_submitted'
  const [fields,      setFields]      = useState(INIT)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)

  useEffect(() => {
    getPublicForm(token)
      .then((data) => {
        if (data.alreadySubmitted) { setError('already_submitted'); return }
        setForm(data)
      })
      .catch((err) => {
        const status = err.response?.status
        if (status === 410) setError('expired')
        else setError('not_found')
      })
      .finally(() => setLoading(false))
  }, [token])

  function handleChange(e) {
    const { name, value } = e.target
    setFields((prev) => ({ ...prev, [name]: value }))
    setFieldErrors((prev) => ({ ...prev, [name]: '' }))
  }

  function validate() {
    const errs = {}
    if (!fields.contactName.trim())  errs.contactName  = 'Vui lòng nhập tên liên hệ'
    if (!fields.phone.trim())        errs.phone        = 'Vui lòng nhập số điện thoại'
    if (!fields.description.trim())  errs.description  = 'Vui lòng mô tả tài liệu'
    if (!fields.sharedLink.trim())   errs.sharedLink   = 'Vui lòng dán link chia sẻ'
    else {
      try { new URL(fields.sharedLink.trim()) }
      catch { errs.sharedLink = 'Link không hợp lệ (phải bắt đầu bằng https://)' }
    }
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setFieldErrors(errs); return }

    setSubmitting(true)
    try {
      await submitPublicForm(token, {
        contactName: fields.contactName.trim(),
        phone:       fields.phone.trim(),
        description: fields.description.trim(),
        sharedLink:  fields.sharedLink.trim(),
        notes:       fields.notes.trim() || null,
      })
      setSubmitted(true)
    } catch (err) {
      const msg = err.response?.data?.error?.message
      if (err.response?.status === 409) { setError('already_submitted'); return }
      if (err.response?.status === 410) { setError('expired'); return }
      setFieldErrors({ _global: msg || 'Gửi thất bại, vui lòng thử lại.' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.spinner} />
          <p className={s.loadingText}>Đang tải...</p>
        </div>
      </div>
    )
  }

  // ── Error states ───────────────────────────────────────────────────────────

  if (error === 'not_found') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.statusIcon}>🔗</div>
          <h2 className={s.statusTitle}>Link không hợp lệ</h2>
          <p className={s.statusText}>Link này đã bị thu hồi hoặc không tồn tại. Vui lòng liên hệ kế toán viên để nhận link mới.</p>
        </div>
      </div>
    )
  }

  if (error === 'expired') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.statusIcon}>⏰</div>
          <h2 className={s.statusTitle}>Link đã hết hạn</h2>
          <p className={s.statusText}>Link này đã hết hạn. Vui lòng liên hệ kế toán viên để nhận link mới.</p>
        </div>
      </div>
    )
  }

  if (error === 'already_submitted') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.statusIcon}>✅</div>
          <h2 className={s.statusTitle}>Đã gửi thành công trước đó</h2>
          <p className={s.statusText}>Bạn đã gửi thông tin cho yêu cầu này rồi. Cảm ơn bạn!</p>
        </div>
      </div>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.statusIcon}>🎉</div>
          <h2 className={s.statusTitle}>Gửi thành công!</h2>
          <p className={s.statusText}>
            Cảm ơn bạn! Chúng tôi đã nhận được thông tin.
            Kế toán viên sẽ liên hệ nếu cần bổ sung.
          </p>
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  const deadlineStr = form.deadlineDate
    ? new Date(form.deadlineDate).toLocaleDateString('vi-VN')
    : null

  return (
    <div className={s.page}>
      <div className={s.card}>
        {/* Header */}
        <div className={s.header}>
          <div className={s.logo}>KẾ TOÁN TÂM AN</div>
          <p className={s.companyLine}>
            <strong>{form.companyName}</strong> yêu cầu bạn cung cấp:
          </p>
          <h1 className={s.docTitle}>📄 {form.documentName}</h1>
          {form.periodLabel && (
            <span className={s.periodBadge}>{form.periodLabel}</span>
          )}
        </div>

        {/* Description */}
        {form.description && (
          <div className={s.descBlock}>
            <p className={s.descLabel}>Hướng dẫn:</p>
            <p className={s.descText}>{form.description}</p>
          </div>
        )}

        {deadlineStr && (
          <div className={s.deadlineBar}>
            ⏳ Hạn cung cấp: <strong>{deadlineStr}</strong>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className={s.formSection}>
            <h3 className={s.formSectionTitle}>Thông tin cung cấp</h3>

            <div className={s.field}>
              <label className={s.label}>Tên liên hệ <span className={s.required}>*</span></label>
              <input
                className={`${s.input} ${fieldErrors.contactName ? s.inputError : ''}`}
                name="contactName"
                value={fields.contactName}
                onChange={handleChange}
                placeholder="Họ và tên người liên hệ"
              />
              {fieldErrors.contactName && <p className={s.fieldErr}>{fieldErrors.contactName}</p>}
            </div>

            <div className={s.field}>
              <label className={s.label}>Số điện thoại <span className={s.required}>*</span></label>
              <input
                className={`${s.input} ${fieldErrors.phone ? s.inputError : ''}`}
                name="phone"
                type="tel"
                value={fields.phone}
                onChange={handleChange}
                placeholder="0901 234 567"
              />
              {fieldErrors.phone && <p className={s.fieldErr}>{fieldErrors.phone}</p>}
            </div>

            <div className={s.field}>
              <label className={s.label}>Mô tả tài liệu <span className={s.required}>*</span></label>
              <textarea
                className={`${s.textarea} ${fieldErrors.description ? s.inputError : ''}`}
                name="description"
                rows={3}
                value={fields.description}
                onChange={handleChange}
                placeholder="Mô tả ngắn về tài liệu đã chuẩn bị..."
              />
              {fieldErrors.description && <p className={s.fieldErr}>{fieldErrors.description}</p>}
            </div>

            <div className={s.field}>
              <label className={s.label}>Link chia sẻ <span className={s.required}>*</span></label>
              <input
                className={`${s.input} ${fieldErrors.sharedLink ? s.inputError : ''}`}
                name="sharedLink"
                type="url"
                value={fields.sharedLink}
                onChange={handleChange}
                placeholder="https://drive.google.com/..."
              />
              {fieldErrors.sharedLink && <p className={s.fieldErr}>{fieldErrors.sharedLink}</p>}
            </div>

            <div className={s.field}>
              <label className={s.label}>Ghi chú thêm</label>
              <textarea
                className={s.textarea}
                name="notes"
                rows={2}
                value={fields.notes}
                onChange={handleChange}
                placeholder="Thông tin bổ sung (không bắt buộc)..."
              />
            </div>

            {fieldErrors._global && (
              <p className={s.globalErr}>{fieldErrors._global}</p>
            )}
          </div>

          <div className={s.hint}>
            💡 <strong>Hướng dẫn:</strong> Upload tài liệu lên Google Drive / Zalo / Dropbox,
            sau đó copy link chia sẻ và dán vào ô "Link chia sẻ" phía trên.
            Không cần upload file trực tiếp lên hệ thống này.
          </div>

          <button
            type="submit"
            className={s.submitBtn}
            disabled={submitting}
          >
            {submitting ? 'Đang gửi...' : 'Gửi thông tin'}
          </button>
        </form>
      </div>
    </div>
  )
}
