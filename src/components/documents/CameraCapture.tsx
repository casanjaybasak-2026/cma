import { useEffect, useRef, useState } from 'react'
import { Camera, AlertCircle, RefreshCw } from 'lucide-react'

export function CameraCapture({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  async function startCamera() {
    setError(null)
    setReady(false)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera capture is not supported on this browser or device. Please use file upload instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setReady(true)
    } catch (err) {
      setError(
        'Could not access the camera. Please grant camera permission, or use file upload instead.'
      )
    }
  }

  useEffect(() => {
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    onCapture(canvas.toDataURL('image/jpeg', 0.92))
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500" />
        <p className="text-sm text-amber-800">{error}</p>
        <button className="btn-secondary btn-sm" onClick={startCamera}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry Camera
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} className="aspect-[3/4] w-full object-cover sm:aspect-video" muted playsInline />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
            Starting camera…
          </div>
        )}
      </div>
      <button className="btn-primary w-full" onClick={capture} disabled={!ready}>
        <Camera className="h-4 w-4" /> Capture Page
      </button>
    </div>
  )
}
