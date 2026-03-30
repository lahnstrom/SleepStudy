import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useAuth } from './useAuth'

interface LabContextValue {
  currentLabId: number | null
  setCurrentLabId: (id: number | null) => void
}

const LabContext = createContext<LabContextValue | null>(null)

export function LabProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [currentLabId, setCurrentLabId] = useState<number | null>(null)

  useEffect(() => {
    if (user?.role === 'lab_user' && user.labId) {
      setCurrentLabId(user.labId)
    }
  }, [user])

  return (
    <LabContext.Provider value={{ currentLabId, setCurrentLabId }}>
      {children}
    </LabContext.Provider>
  )
}

export function useLab(): LabContextValue {
  const ctx = useContext(LabContext)
  if (!ctx) throw new Error('useLab must be used within LabProvider')
  return ctx
}
