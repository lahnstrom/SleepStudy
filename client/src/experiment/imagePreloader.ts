import type { ImageAssignment } from '../lib/experimentTypes'

const API_URL = import.meta.env.VITE_API_URL

export async function preloadImages(
  assignments: ImageAssignment[],
  onProgress: (loaded: number, total: number) => void
): Promise<Map<number, HTMLImageElement>> {
  const images = new Map<number, HTMLImageElement>()
  const total = assignments.length
  let loaded = 0

  const results = await Promise.allSettled(
    assignments.map((a) => loadSingleImage(a).then((img) => {
      images.set(a.image_id, img)
      loaded++
      onProgress(loaded, total)
    }))
  )

  const failed = results
    .map((r, i) => (r.status === 'rejected' ? assignments[i].filename : null))
    .filter((f): f is string => f !== null)

  if (failed.length > 0) {
    throw new ImageLoadError(failed)
  }

  return images
}

async function loadSingleImage(assignment: ImageAssignment, retries = 3): Promise<HTMLImageElement> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${API_URL}/images/${encodeURIComponent(assignment.filename)}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Failed to decode ${assignment.filename}`))
        img.src = url
      })
    } catch (err) {
      if (attempt === retries - 1) throw err
    }
  }
  throw new Error('Unreachable')
}

export class ImageLoadError extends Error {
  constructor(public failedImages: string[]) {
    super(`Failed to load ${failedImages.length} images`)
    this.name = 'ImageLoadError'
  }
}

export function createPracticeImages(count: number): Map<number, HTMLImageElement> {
  const images = new Map<number, HTMLImageElement>()
  const greys = [120, 140, 160, 100, 130, 150]

  for (let i = 0; i < count; i++) {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    const ctx = canvas.getContext('2d')!
    const g = greys[i % greys.length]
    ctx.fillStyle = `rgb(${g}, ${g}, ${g})`
    ctx.fillRect(0, 0, 800, 600)
    ctx.fillStyle = '#fff'
    ctx.font = '24px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`Practice ${i + 1}`, 400, 300)

    const img = new Image()
    img.src = canvas.toDataURL()
    images.set(-(i + 1), img) // negative IDs for practice
  }

  return images
}
