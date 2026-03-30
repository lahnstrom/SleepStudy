import { useRef, useEffect } from 'react'

export default function ImageDisplay({ image }: { image: HTMLImageElement | null }) {
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (imgRef.current && image) {
      imgRef.current.src = image.src
    }
  }, [image])

  if (!image) return <div className="experiment-blank" />

  return (
    <img
      ref={imgRef}
      className="experiment-image"
      alt=""
      src={image.src}
    />
  )
}
