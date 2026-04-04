import { useEffect, useRef, type ReactNode } from 'react'

export default function FullscreenWrapper({ children }: { children: ReactNode }) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    // Request fullscreen
    document.documentElement.requestFullscreen?.().catch(() => {})

    // Request wake lock
    navigator.wakeLock?.request('screen')
      .then((lock) => { wakeLockRef.current = lock })
      .catch(() => {})

    // Hide cursor
    document.body.style.cursor = 'none'

    // Disable context menu
    const preventContext = (e: Event) => e.preventDefault()
    document.addEventListener('contextmenu', preventContext)

    // Warn before leaving
    const preventUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', preventUnload)

    return () => {
      document.body.style.cursor = ''
      document.removeEventListener('contextmenu', preventContext)
      window.removeEventListener('beforeunload', preventUnload)
      wakeLockRef.current?.release()
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  return (
    <div className="experiment-bg">
      {children}
    </div>
  )
}
