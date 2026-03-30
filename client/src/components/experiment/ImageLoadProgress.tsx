export default function ImageLoadProgress({ loaded, total }: { loaded: number; total: number }) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
  return (
    <div className="image-load-screen">
      <p>Loading images: {loaded} / {total}</p>
      <div className="image-load-bar-track">
        <div className="image-load-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
