import s from './layout.module.css'

export default function Footer() {
  return (
    <footer className={s.footer}>
      <span className={s.footerText}>
        © 2026 <span className={s.footerAccent}>Kế Toán Tâm An</span> · v1.0.0
      </span>
      <span className={s.footerText}>
        Developed by{' '}
        <a
          href="https://bbotech.vn"
          target="_blank"
          rel="noopener noreferrer"
          className={s.footerLink}
        >
          bbotech.vn
        </a>
      </span>
    </footer>
  )
}
