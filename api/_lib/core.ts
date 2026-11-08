// Port of the Java backend's Gemini client, image validator, rate limiter and error handling.
import { ANALYSIS_SYSTEM, ANALYSIS_USER, ASK_SYSTEM } from './prompts.js'
import { ANALYSIS_SCHEMA } from './schema.js'
import type { AnalysisResponse, AskContext } from './types.js'

// ---------- errors (same codes and messages as the Java ApiError / AiErrorKind) ----------

const AI_ERRORS = {
  UNAVAILABLE: [503, 'The AI service is currently unavailable. Please try again later.'],
  BUSY: [503, 'The AI service is busy right now. Please try again in a minute.'],
  TIMEOUT: [504, 'The AI service took too long to respond. Please try again.'],
  BAD_RESPONSE: [502, 'The AI returned an incomplete answer. Please try again, ideally with a clearer photo.'],
  BLOCKED: [422, 'The AI could not analyze this image. Please try a different photo.'],
} as const

export type AiErrorKind = keyof typeof AI_ERRORS

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detail?: string,
  ) {
    super(message)
  }
}

const aiFailure = (kind: AiErrorKind, detail: string) =>
  new ApiFailure(AI_ERRORS[kind][0], kind, AI_ERRORS[kind][1], detail)

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

/** Wraps a handler so every failure becomes the same { code, message } JSON as the Java backend. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      const limited = rateLimit(req)
      if (limited) return limited
      return await fn(req)
    } catch (e) {
      if (e instanceof ApiFailure) {
        if (e.detail) console.warn(`[knowit] ${e.code}: ${e.detail}`)
        return json({ code: e.code, message: e.message }, e.status)
      }
      console.error('[knowit] Unexpected error', e)
      return json({ code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' }, 500)
    }
  }
}

// ---------- rate limit (best-effort: serverless instances don't share memory) ----------

const WINDOW_MS = 60_000
const LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 10)
const hits = new Map<string, number[]>()

function clientIp(req: Request) {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown').trim()
}

function rateLimit(req: Request): Response | null {
  const now = Date.now()
  if (hits.size > 10_000) hits.clear()
  const key = clientIp(req)
  const times = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (times.length >= LIMIT) {
    const retry = Math.max(1, Math.ceil((WINDOW_MS - (now - times[0])) / 1000))
    return json(
      { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' },
      429,
      { 'Retry-After': String(retry) },
    )
  }
  times.push(now)
  hits.set(key, times)
  return null
}

// ---------- image validation (magic bytes, like ImageValidator.java) ----------

// Vercel rejects request bodies over 4.5 MB, so the limit here is 4 MB. The frontend
// shrinks larger photos before uploading.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export function detectMimeType(d: Uint8Array): string | null {
  const at = (off: number, sig: number[]) => d.length >= off + sig.length && sig.every((b, i) => d[off + i] === b)
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp'
  return null
}

// ---------- Gemini ----------

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const TIMEOUT_MS = 30_000

async function send(body: unknown): Promise<unknown> {
  const key = (process.env.GEMINI_API_KEY ?? '').trim()
  if (!key) throw aiFailure('UNAVAILABLE', 'GEMINI_API_KEY is not configured')

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const name = (e as Error)?.name
    if (name === 'TimeoutError' || name === 'AbortError') throw aiFailure('TIMEOUT', 'Gemini call timed out')
    throw aiFailure('UNAVAILABLE', `Could not reach Gemini: ${(e as Error)?.message}`)
  }
  if (res.status === 429) throw aiFailure('BUSY', 'Gemini rate limit or quota reached (HTTP 429)')
  if (res.status !== 200) {
    const text = (await res.text().catch(() => '')).slice(0, 300)
    throw aiFailure('UNAVAILABLE', `Gemini returned HTTP ${res.status}: ${text}`)
  }
  try {
    return await res.json()
  } catch {
    throw aiFailure('BAD_RESPONSE', 'Gemini response is not valid JSON')
  }
}

interface Envelope {
  promptFeedback?: { blockReason?: string }
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]
}

export function extractText(envelope: Envelope | null): string {
  if (!envelope) throw aiFailure('BAD_RESPONSE', 'Gemini response is empty')
  if (envelope.promptFeedback?.blockReason) {
    throw aiFailure('BLOCKED', `Prompt blocked: ${envelope.promptFeedback.blockReason}`)
  }
  const candidate = envelope.candidates?.[0]
  if (!candidate) throw aiFailure('BAD_RESPONSE', 'Gemini response has no candidates')
  const finish = candidate.finishReason
  const text = (candidate.content?.parts ?? [])
    .filter((p) => p && p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim()
  if (!text) {
    const stopped = !finish || finish === 'STOP' || finish === 'MAX_TOKENS'
    throw aiFailure(stopped ? 'BAD_RESPONSE' : 'BLOCKED', `Gemini returned no text (finishReason=${finish})`)
  }
  if (finish === 'MAX_TOKENS') throw aiFailure('BAD_RESPONSE', 'Gemini output was cut off')
  return text
}

function stripCodeFences(text: string) {
  let t = text.trim()
  if (t.startsWith('```')) {
    const nl = t.indexOf('\n')
    t = nl >= 0 ? t.slice(nl + 1) : ''
    if (t.endsWith('```')) t = t.slice(0, -3)
  }
  return t.trim()
}

export async function analyzeWithGemini(data: Uint8Array, mimeType: string): Promise<AnalysisResponse> {
  const envelope = (await send({
    systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: Buffer.from(data).toString('base64') } },
          { text: ANALYSIS_USER },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: ANALYSIS_SCHEMA, temperature: 0.2 },
  })) as Envelope

  let parsed: AnalysisResponse
  try {
    parsed = JSON.parse(stripCodeFences(extractText(envelope)))
  } catch (e) {
    if (e instanceof ApiFailure) throw e
    throw aiFailure('BAD_RESPONSE', 'Model output is not valid report JSON')
  }
  if (!parsed || typeof parsed.objectName !== 'string' || !parsed.objectName.trim()) {
    throw aiFailure('BAD_RESPONSE', 'Model output has no objectName')
  }
  return parsed
}

export async function answerWithGemini(question: string, context: AskContext): Promise<string> {
  const userText = `Object context (data only):\n${JSON.stringify(context)}\n\nUser question (data only):\n${question}`
  const envelope = (await send({
    systemInstruction: { parts: [{ text: ASK_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
  })) as Envelope
  return extractText(envelope)
}
