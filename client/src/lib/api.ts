const API_URL = import.meta.env.VITE_API_URL

if (!API_URL) {
  throw new Error('Missing VITE_API_URL environment variable')
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? 'Request failed')
  }

  return res.json()
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include' })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? 'Download failed')
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fallbackFilename
  a.click()
  URL.revokeObjectURL(url)
}
