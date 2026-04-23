import { useCallback } from 'react'
import '../styles/dev-card.css'

export const DEVELOPER = {
  name: 'Nadir Infograph',
  fullName: 'نذير حوامرية',
  avatar: 'https://i.postimg.cc/Y0zgGHqt/FB-IMG-1775858111445.jpg',
  facebookUsername: 'nadir.infograph23',
  facebookWeb: 'https://facebook.com/nadir.infograph23',
}

function isMobile() {
  if (typeof navigator === 'undefined') return false
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
}

function openFacebook() {
  const web = DEVELOPER.facebookWeb
  if (!isMobile()) {
    window.open(web, '_blank', 'noopener,noreferrer')
    return
  }
  // Try app deep-link, fall back to web
  const deep = `fb://facewebmodal/f?href=${encodeURIComponent(web)}`
  let timer: ReturnType<typeof setTimeout> | null = null
  const onHide = () => {
    if (document.hidden && timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  document.addEventListener('visibilitychange', onHide, { once: true })
  timer = setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    window.location.href = web
  }, 700)
  window.location.href = deep
}

export function DeveloperCard() {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    openFacebook()
  }, [])

  return (
    <div className="dev-card">
      <img
        className="dev-card-avatar"
        src={DEVELOPER.avatar}
        alt={DEVELOPER.name}
      />
      <div className="dev-card-info">
        <span className="dev-card-label">عن المطور</span>
        <span className="dev-card-name">{DEVELOPER.fullName} — {DEVELOPER.name}</span>
        <span className="dev-card-role">خبير في الذكاء الاصطناعي 🇩🇿</span>
      </div>
      <a
        className="dev-card-fb"
        href={DEVELOPER.facebookWeb}
        onClick={handleClick}
        target="_blank"
        rel="noreferrer"
        title="Facebook"
        aria-label="Facebook"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
        </svg>
      </a>
    </div>
  )
}

export default DeveloperCard
