import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

interface UseFetchResult<T> {
  data: T | null
  error: string | null
  loading: boolean
  refetch: () => void
}

export function useFetch<T>(path: string | null): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (path === null) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    api<T>(path)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Request failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [path, tick])

  return { data, error, loading, refetch }
}
