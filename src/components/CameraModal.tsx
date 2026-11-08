import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  onCapture: (file: File) => void
  onClose: () => void
  onFallback: () => void
}

type Status = 'starting' | 'live' | 'captured' | 'error'

export default function CameraModal({ onCapture, onClose, onFallback }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const [status, setStatus] = useState<Status>('starting')
  const [error, setError] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(
    async (id?: string) => {
      stop()
      setStatus('starting')
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open a camera. Choose a photo from your device instead.')
        setStatus('error')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: id
            ? { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        const current = stream.getVideoTracks()[0]?.getSettings().deviceId ?? ''
        setDeviceId(current)
        // Labels are only available after permission is granted, so list devices now.
        const all = await navigator.mediaDevices.enumerateDevices()
        setDevices(all.filter((d) => d.kind === 'videoinput'))
        setStatus('live')
      } catch (e) {
        const name = (e as DOMException)?.name
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it from the camera icon in the address bar, then try again.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera was found. Check that your webcam is plugged in, or choose a photo instead.'
              : name === 'NotReadableError'
                ? 'The camera is being used by another app (Zoom, Teams, OBS…). Close it and try again.'
                : 'The camera could not be started. Choose a photo from your device instead.',
        )
        setStatus('error')
      }
    },
    [stop],
  )

  useEffect(() => {
    void start()
    return stop
  }, [start, stop])

  useEffect(() => {
    return () => {
      if (shot) URL.revokeObjectURL(shot.url)
    }
  }, [shot])

  // Escape closes; focus the dialog on open.
  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return
    // Downscale very large frames so the JPEG stays well under the 5 MB limit.
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        setShot({ url: URL.createObjectURL(blob), blob })
        setStatus('captured')
      },
      'image/jpeg',
      0.9,
    )
  }

  function retake() {
    setShot(null)
    setStatus('live')
  }

  function usePhoto() {
    if (!shot) return
    const file = new File([shot.blob], `webcam-${Date.now()}.jpg`, { type: 'image/jpeg' })
    stop()
    onCapture(file)
  }

  return (
    <div className="cam-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="cam"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cam-title"
        tabIndex={-1}
      >
        <div className="cam__head">
          <h2 id="cam-title">Take a photo</h2>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="cam__stage">
          <video
            ref={videoRef}
            playsInline
            muted
            className={status === 'live' ? '' : 'cam__hidden'}
          />
          {shot && status === 'captured' && <img src={shot.url} alt="Captured frame" />}
          {status === 'starting' && <p className="cam__msg">Starting camera…</p>}
          {status === 'error' && (
            <p className="cam__msg cam__msg--error" role="alert">
              {error}
            </p>
          )}
          <span className="corner corner--tl" aria-hidden="true" />
          <span className="corner corner--tr" aria-hidden="true" />
          <span className="corner corner--bl" aria-hidden="true" />
          <span className="corner corner--br" aria-hidden="true" />
        </div>
        <canvas ref={canvasRef} hidden />

        <div className="cam__controls">
          {devices.length > 1 && status !== 'error' && (
            <label className="cam__select">
              <span className="visually-hidden">Camera</span>
              <select
                value={deviceId}
                onChange={(e) => {
                  setShot(null)
                  void start(e.target.value)
                }}
                disabled={status === 'captured'}
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="cam__buttons">
            {status === 'live' && (
              <button type="button" className="btn btn--primary" onClick={capture}>
                Capture
              </button>
            )}
            {status === 'captured' && (
              <>
                <button type="button" className="btn" onClick={retake}>
                  Retake
                </button>
                <button type="button" className="btn btn--primary" onClick={usePhoto}>
                  Analyse this photo
                </button>
              </>
            )}
            {status === 'error' && (
              <>
                <button type="button" className="btn" onClick={() => void start(deviceId || undefined)}>
                  Try again
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    stop()
                    onFallback()
                  }}
                >
                  Choose from device
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
