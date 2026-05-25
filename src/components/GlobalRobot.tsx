import { useState, useEffect } from 'react'
import DZRobot from './DZRobot'
import '../styles/global-robot.css'

export default function GlobalRobot() {
  const [showRobot, setShowRobot] = useState(
    () => localStorage.getItem('dz-robot-hidden') !== '1'
  )

  useEffect(() => {
    const handler = () => {
      setShowRobot(localStorage.getItem('dz-robot-hidden') !== '1')
    }
    window.addEventListener('dz-robot-toggle', handler)
    return () => window.removeEventListener('dz-robot-toggle', handler)
  }, [])

  const handleShow = () => {
    localStorage.removeItem('dz-robot-hidden')
    setShowRobot(true)
  }

  if (showRobot) return <DZRobot />

  return (
    <button
      className="gr-restore-btn"
      onClick={handleShow}
      title="إظهار الروبوت"
      aria-label="إظهار الروبوت"
    >
      🤖
    </button>
  )
}
