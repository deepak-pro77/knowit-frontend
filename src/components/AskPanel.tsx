import { useEffect, useRef, useState, type FormEvent } from 'react'
import { askQuestion, KnowItError, QUESTION_MAX } from '../lib/api'
import type { AskContext } from '../lib/types'

interface Props {
  context: AskContext
}

interface Turn {
  id: number
  question: string
  answer?: string
  error?: string
}

const SUGGESTIONS = [
  'How do I store this safely?',
  'What should I check before using it?',
  'Is there anything I should never do with it?',
  'Explain this in Urdu.',
]

export default function AskPanel({ context }: Props) {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)

  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [turns])

  async function submit(text: string) {
    const q = text.trim()
    if (!q || busy) return
    const id = nextId.current++
    setTurns((t) => [...t, { id, question: q }])
    setQuestion('')
    setBusy(true)
    try {
      const { answer } = await askQuestion(q, context)
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, answer } : turn)))
    } catch (e) {
      const msg =
        e instanceof KnowItError
          ? e.code === 'RATE_LIMITED' && e.retryAfterSeconds
            ? `Too many requests. Try again in about ${e.retryAfterSeconds} seconds.`
            : e.message
          : 'Something went wrong. Try asking again.'
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, error: msg } : turn)))
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void submit(question)
  }

  return (
    <section className="ask" aria-labelledby="ask-title">
      <div className="ask__intro">
        <h2 id="ask-title">Ask about this {context.objectName.toLowerCase()}</h2>
        <p>
          Questions about what it is, how to use or handle it, and related topics. The answer knows
          the hazards listed above and will stay as cautious as the report.
        </p>
      </div>

      {turns.length === 0 && (
        <ul className="ask__suggestions" aria-label="Example questions">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button type="button" className="chip" onClick={() => void submit(s)} disabled={busy}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ol className="thread" aria-live="polite">
        {turns.map((t) => (
          <li key={t.id} className="turn">
            <p className="turn__q">{t.question}</p>
            {t.answer && <div className="turn__a">{t.answer.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>}
            {t.error && (
              <p className="turn__a turn__a--error" role="alert">
                {t.error}
              </p>
            )}
            {!t.answer && !t.error && (
              <p className="turn__a turn__a--pending" aria-label="Waiting for answer">
                Thinking
              </p>
            )}
          </li>
        ))}
        <div ref={endRef} />
      </ol>

      <form className="ask__form" onSubmit={onSubmit}>
        <label htmlFor="ask-input" className="visually-hidden">
          Your question
        </label>
        <textarea
          id="ask-input"
          rows={2}
          maxLength={QUESTION_MAX}
          placeholder="Type a question about this object"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit(question)
            }
          }}
          disabled={busy}
        />
        <div className="ask__row">
          <span className="ask__count">
            {question.length}/{QUESTION_MAX}
          </span>
          <button type="submit" className="btn btn--primary" disabled={busy || !question.trim()}>
            {busy ? 'Asking' : 'Ask'}
          </button>
        </div>
      </form>
    </section>
  )
}
