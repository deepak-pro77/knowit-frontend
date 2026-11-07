import type { AnalysisResponse, AskContext, AskRequest, AskResponse } from './types'

const BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')

// Same limits as the backend (ImageValidator / application.yml).
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
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
      `Could not reach the KnowIt server at ${BASE}. Check that the backend is running.`,
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
