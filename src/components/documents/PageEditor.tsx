import { useEffect, useRef, useState } from 'react'
import { RotateCw, Crop, X } from 'lucide-react'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function PageEditor({
  dataUrl,
  onChange,
}: {
  dataUrl: string
  onChange: (newDataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const img = new Image()
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      setImgDims({ width: img.width, height: img.height })
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0)
    }
    img.src = dataUrl
  }, [dataUrl])

  function rotate90() {
    const canvas = canvasRef.current
    if (!canvas) return
    const rotated = document.createElement('canvas')
    rotated.width = canvas.height
    rotated.height = canvas.width
    const ctx = rotated.getContext('2d')!
    ctx.translate(rotated.width / 2, rotated.height / 2)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
    const newUrl = rotated.toDataURL('image/jpeg', 0.92)
    onChange(newUrl)
  }

  function toRelative(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect()
    const scaleX = imgDims.width / rect.width
    const scaleY = imgDims.height / rect.height
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
  }

  function onPointerDown(e: React.PointerEvent) {
    const pos = toRelative(e.clientX, e.clientY)
    setDragStart(pos)
    setSelection({ x: pos.x, y: pos.y, w: 0, h: 0 })
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart) return
    const pos = toRelative(e.clientX, e.clientY)
    setSelection({
      x: Math.min(dragStart.x, pos.x),
      y: Math.min(dragStart.y, pos.y),
      w: Math.abs(pos.x - dragStart.x),
      h: Math.abs(pos.y - dragStart.y),
    })
  }

  function onPointerUp() {
    setDragStart(null)
  }

  function applyCrop() {
    const canvas = canvasRef.current
    if (!canvas || !selection || selection.w < 10 || selection.h < 10) return
    const cropped = document.createElement('canvas')
    cropped.width = selection.w
    cropped.height = selection.h
    const ctx = cropped.getContext('2d')!
    ctx.drawImage(canvas, selection.x, selection.y, selection.w, selection.h, 0, 0, selection.w, selection.h)
    onChange(cropped.toDataURL('image/jpeg', 0.92))
    setSelection(null)
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative w-full touch-none overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <canvas ref={canvasRef} className="block w-full select-none" />
        {selection && imgDims.width > 0 && (
          <div
            className="pointer-events-none absolute border-2 border-bank-500 bg-bank-500/10"
            style={{
              left: `${(selection.x / imgDims.width) * 100}%`,
              top: `${(selection.y / imgDims.height) * 100}%`,
              width: `${(selection.w / imgDims.width) * 100}%`,
              height: `${(selection.h / imgDims.height) * 100}%`,
            }}
          />
        )}
      </div>
      <p className="text-xs text-slate-400">Drag on the image to select a crop area.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={rotate90}>
          <RotateCw className="h-3.5 w-3.5" /> Rotate
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={applyCrop}
          disabled={!selection || selection.w < 10}
        >
          <Crop className="h-3.5 w-3.5" /> Apply Crop
        </button>
        {selection && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSelection(null)}>
            <X className="h-3.5 w-3.5" /> Clear Selection
          </button>
        )}
      </div>
    </div>
  )
}
