import s from './PaginationFooter.module.css'

function buildPageWindow(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, 'right-gap', totalPages]
  if (page >= totalPages - 3) {
    return [1, 'left-gap', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }
  return [1, 'left-gap', page - 1, page, page + 1, 'right-gap', totalPages]
}

export default function PaginationFooter({
  total = 0,
  from = 0,
  to = 0,
  itemLabel = 'dòng',
  page = 1,
  pageSize = 20,
  totalPages = 1,
  pageSizeOptions = [20, 50, 100],
  onPageChange,
  onPageSizeChange,
  loading = false,
  details,
}) {
  const safeTotalPages = Math.max(1, Number(totalPages) || 1)
  const safePage = Math.min(Math.max(1, Number(page) || 1), safeTotalPages)
  const canNavigate = !loading && typeof onPageChange === 'function'

  function go(nextPage) {
    if (!canNavigate) return
    onPageChange(Math.min(Math.max(1, nextPage), safeTotalPages))
  }

  return (
    <footer className={s.root} aria-label="Phân trang">
      <div className={s.summary} aria-live="polite">
        <span className={s.total}>
          {loading ? 'Đang tải…' : `${from}–${to} / ${total} ${itemLabel}`}
        </span>
        {details && <span className={s.details}>{details}</span>}
      </div>

      <div className={s.pageSize} aria-label="Số dòng mỗi trang">
        <span className={s.label}>Số dòng/trang</span>
        {pageSizeOptions.map((size) => (
          <button
            key={size}
            type="button"
            className={`${s.sizeButton} ${pageSize === size ? s.active : ''}`}
            aria-pressed={pageSize === size}
            disabled={loading || typeof onPageSizeChange !== 'function'}
            onClick={() => onPageSizeChange?.(size)}
          >
            {size}
          </button>
        ))}
      </div>

      <nav className={s.navigation} aria-label="Điều hướng trang">
        <button type="button" className={s.pageButton} onClick={() => go(1)} disabled={!canNavigate || safePage === 1} aria-label="Trang đầu">«</button>
        <button type="button" className={s.pageButton} onClick={() => go(safePage - 1)} disabled={!canNavigate || safePage === 1} aria-label="Trang trước">‹</button>
        {buildPageWindow(safePage, safeTotalPages).map((entry) => (
          typeof entry === 'string'
            ? <span key={entry} className={s.ellipsis}>…</span>
            : (
              <button
                key={entry}
                type="button"
                className={`${s.pageButton} ${safePage === entry ? s.active : ''}`}
                aria-current={safePage === entry ? 'page' : undefined}
                disabled={!canNavigate}
                onClick={() => go(entry)}
              >
                {entry}
              </button>
            )
        ))}
        <button type="button" className={s.pageButton} onClick={() => go(safePage + 1)} disabled={!canNavigate || safePage === safeTotalPages} aria-label="Trang sau">›</button>
        <button type="button" className={s.pageButton} onClick={() => go(safeTotalPages)} disabled={!canNavigate || safePage === safeTotalPages} aria-label="Trang cuối">»</button>
      </nav>
    </footer>
  )
}
