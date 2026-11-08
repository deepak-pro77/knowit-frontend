import type { AnalysisResponse, AskContext, AskRequest, AskResponse } from './types'

// ---------- which backend to talk to ----------
// 1. ?api=<url> in the address bar (remembered in this browser) — e.g. the Java backend through a tunnel.
//    ?api=default switches back.
// 2. VITE_API_BASE_URL at build time.
// 3. Otherwise: the Java backend on localhost in development, and the Vercel functions
//    on the same site in production.
const OVERRIDE_KEY = 'knowit.apiBase'

function readOverride(): string | null {
  try {
    const param = new URLSearchParams(window.location.search).get('api')
    if (param !== null) {
      const url = new URL(window.location.href)
      url.searchParams.delete('api')
      window.history.replaceState(null, '', url.toString())
      if (param === '' || param === 'default') {
        localStorage.removeItem(OVERRIDE_KEY)
        return null
      }
      const ok = /^https:\/\/[^\s]+$/i.test(param) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(param)
      if (ok) {
        localStorage.setItem(OVERRIDE_KEY, param)
        return param
      }
    }
    return localStorage.getItem(OVERRIDE_KEY)
  } catch {
    return null
  }
}

const override = readOverride()
const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined
const BASE = (override ?? (envBase || (import.meta.env.DEV ? 'http://localhost:8080' : ''))).replace(/\/$/, '')

function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export const backendInfo = {
  /** Short label for the footer. */
  label: BASE === '' ? 'Vercel functions' : BASE.includes('localhost') ? 'Java backend (local)' : `Java backend · ${hostOf(BASE)}`,
  overridden: override !== null,
}

// The Java backend accepts 5 MB; Vercel functions accept about 4 MB. Photos above
// SHRINK_ABOVE are resized in the browser first, so either backend accepts them.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const SHRINK_ABOVE = 3.5 * 1024 * 1024
export const MAX_INPUT_BYTES = 25 * 1024 * 1024
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Same limits as AskRequest's validation annotations.
const LIMITS = { question: 500, objectName: 200, category: 200, description: 1000, listItems: 15, listItem: 300 }

export class KnowItError extends Error {
  code: string
  status: number
  retryAfterSeconds?: number

  constructor(code: string, message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.code = code
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

async function parseError(res: Response): Promise<KnowItError> {
  let code = 'REQUEST_ERROR'
  let message = 'The request could not be processed.'
  try {
    const body = (await res.json()) as { code?: string; message?: string }
    if (body.code) code = body.code
    if (body.message) message = body.message
  } catch {
    // Non-JSON body (e.g. proxy error page): keep the generic message.
  }
  const retry = res.headers.get('Retry-After')
  return new KnowItError(code, message, res.status, retry ? Number(retry) : undefined)
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, init)
  } catch {
    throw new KnowItError(
      'NETWORK',
      BASE
        ? `Could not reach the KnowIt server at ${BASE}. Check that the backend and tunnel are running.`
        : 'Could not reach the KnowIt server. Check your connection and try again.',
      0,
    )
  }
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as T
}

export function analyzeImage(file: File): Promise<AnalysisResponse> {
  const form = new FormData()
  form.append('image', file, file.name)
  return send<AnalysisResponse>('/api/v1/objects/analyze', { method: 'POST', body: form })
}

/** Builds the small, size-limited context the /ask endpoint accepts from a full report. */
export function contextFromReport(report: AnalysisResponse): AskContext {
  const clip = (s: string | undefined, n: number) => (s ?? '').slice(0, n)
  const clipList = (xs: string[] | undefined) =>
    (xs ?? []).slice(0, LIMITS.listItems).map((x) => x.slice(0, LIMITS.listItem))
  return {
    objectName: clip(report.objectName, LIMITS.objectName) || 'Unidentified object',
    category: clip(report.category, LIMITS.category),
    description: clip(report.description, LIMITS.description),
    knownHazards: clipList(report.safety?.knownHazards),
    precautions: clipList(report.safety?.precautions),
  }
}

export function askQuestion(question: string, context: AskContext): Promise<AskResponse> {
  const body: AskRequest = { question: question.trim().slice(0, LIMITS.question), context }
  return send<AskResponse>('/api/v1/objects/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export const QUESTION_MAX = LIMITS.question

/** Resizes a photo to fit the upload limit. Small photos are returned unchanged. */
export async function shrinkIfNeeded(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE) return file
  const bitmap = await createImageBitmap(file)
  const attempts: [number, number][] = [[2048, 0.85], [1600, 0.8], [1280, 0.75]]
  try {
    for (const [maxSide, quality] of attempts) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
      if (blob && blob.size <= SHRINK_ABOVE) {
        return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
      }
    }
  } finally {
    bitmap.close()
  }
  return file
}
