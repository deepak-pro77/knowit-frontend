// POST /api/v1/objects/ask  (JSON { question, context }) — same contract and limits as AskRequest.java.
import { ApiFailure, answerWithGemini, handle, json } from '../../_lib/core.js'
import type { AskContext } from '../../_lib/types.js'

function validate(body: unknown): { question: string; context: AskContext } {
  const errors: string[] = []
  const b = (body ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

  const question = str(b.question)
  if (!question?.trim()) errors.push('question must not be blank')
  else if (question.length > 500) errors.push('question size must be between 0 and 500')

  const c = b.context as Record<string, unknown> | undefined
  if (!c || typeof c !== 'object') {
    errors.push('context must not be null')
  } else {
    const name = str(c.objectName)
    if (!name?.trim()) errors.push('context.objectName must not be blank')
    else if (name.length > 200) errors.push('context.objectName size must be between 0 and 200')
    if ((str(c.category) ?? '').length > 200) errors.push('context.category size must be between 0 and 200')
    if ((str(c.description) ?? '').length > 1000) errors.push('context.description size must be between 0 and 1000')
    for (const field of ['knownHazards', 'precautions'] as const) {
      const v = c[field]
      if (v === undefined || v === null) continue
      if (!Array.isArray(v) || v.length > 15) errors.push(`context.${field} size must be between 0 and 15`)
      else if (v.some((x) => typeof x !== 'string' || x.length > 300)) {
        errors.push(`context.${field} items must be text of at most 300 characters`)
      }
    }
  }
  if (errors.length) throw new ApiFailure(400, 'VALIDATION_ERROR', errors.join('; '))

  return {
    question: question!,
    context: {
      objectName: str(c!.objectName)!,
      category: str(c!.category),
      description: str(c!.description),
      knownHazards: (c!.knownHazards as string[] | undefined) ?? [],
      precautions: (c!.precautions as string[] | undefined) ?? [],
    },
  }
}

export const POST = handle(async (req) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ApiFailure(400, 'INVALID_REQUEST', 'The request body is missing or malformed.')
  }
  const { question, context } = validate(body)
  return json({ answer: await answerWithGemini(question, context) })
})
