import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { ACCEPTED_TYPES, MAX_IMAGE_BYTES } from '../lib/api'
import CameraModal from './CameraModal'

// Phones and tablets open their own camera app from a file input with `capture`,
// which is better than an in-page preview. Desktops ignore `capture`, so they get the webcam modal.
const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

interface Props {
  onSelect: (file: File) => void
  disabled?: boolean
}

function validate(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'That file is not a JPEG, PNG or WebP image. Pick a photo in one of those formats.'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return `That photo is ${mb} MB. The limit is 5 MB, so take a smaller one or resize it.`
  }
  return null
}

export default function Capture({ onSelect, disabled }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)

  function takePhoto() {
    setError(null)
    if (isTouchDevice()) cameraInput.current?.click()
    else setCameraOpen(true)
  }

  function accept(file: File | undefined) {
    if (!file) return
    const problem = validate(file)
    setError(problem)
    if (!problem) onSelect(file)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    if (disabled) return
    accept(e.dataTransfer.files?.[0])
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    accept(e.target.files?.[0])
    e.target.value = ''
  }

  return (
    <section className="capture" aria-labelledby="capture-title">
      <div
        className={'viewfinder' + (over ? ' viewfinder--over' : '') + (disabled ? ' viewfinder--busy' : '')}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <span className="corner corner--tl" aria-hidden="true" />
        <span className="corner corner--tr" aria-hidden="true" />
        <span className="corner corner--bl" aria-hidden="true" />
        <span className="corner corner--br" aria-hidden="true" />

        <h1 id="capture-title" className="capture__title">
          Point it at the thing you don't understand.
        </h1>
        <p className="capture__lede">
          One photo of an everyday object. You get what it most likely is, how it works, and how to
          handle it carefully, with the guesswork clearly separated from the evidence.
        </p>

        <div className="capture__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={takePhoto}
            disabled={disabled}
          >
            Take a photo
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => fileInput.current?.click()}
            disabled={disabled}
          >
            Choose from device
          </button>
          <span className="capture__hint">or drop an image here</span>
        </div>

        <input
          ref={cameraInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={onChange}
          hidden
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onChange}
          hidden
        />
      </div>

      {cameraOpen && (
        <CameraModal
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            setCameraOpen(false)
            accept(file)
          }}
          onFallback={() => {
            setCameraOpen(false)
            fileInput.current?.click()
          }}
        />
      )}

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      <ul className="capture__rules">
        <li>JPEG, PNG or WebP, up to 5 MB.</li>
        <li>Photograph one object, not people. Labels and model numbers help a lot.</li>
        <li>Nothing is ever declared safe from a photo. Treat every report as a starting point.</li>
      </ul>
    </section>
  )
}