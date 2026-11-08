import { useEffect, useMemo, useState } from 'react'
import Capture from './components/Capture'
import Report from './components/Report'
import AskPanel from './components/AskPanel'
import { analyzeImage, backendInfo, contextFromReport, KnowItError } from './lib/api'
import type { AnalysisResponse } from './lib/types'

type State =
  | { kind: 'idle' }
  | { kind: 'analyzing'; file: File; url: string }
  | { kind: 'done'; file: File; url: string; report: AnalysisResponse }
  | { kind: 'failed'; file: File; url: string; message: string; retryable: boolean }

const ERROR_HELP: Record<string, string> = {
  RATE_LIMITED: 'You have sent too many photos in the last minute.',
  FILE_TOO_LARGE: 'The photo is over the upload limit. Pick a smaller one and try again.',
  UNSUPPORTED_TYPE: 'Only JPEG, PNG and WebP photos are accepted.',
  EMPTY_FILE: 'The file was empty. Pick another photo.',
  UNREADABLE: 'The file could not be read. Pick another photo.',
  BLOCKED: 'This photo could not be analysed. Try a different one.',
  BAD_RESPONSE: 'The analysis came back incomplete. Try again, ideally with a clearer photo.',
  TIMEOUT: 'The analysis took too long. Try again.',
  BUSY: 'The service is busy. Wait a minute and try again.',
  UNAVAILABLE: 'The service is unavailable right now. Try again later.',
}

export default function App() {
  const [state, setState] = useState<State>({ kind: 'idle' })

  // Release object URLs when they are no longer displayed.
  useEffect(() => {
    if (state.kind === 'idle') return
    const url = state.url
    return () => URL.revokeObjectURL(url)
  }, [state.kind === 'idle' ? null : state.url]) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(file: File, url: string) {
    setState({ kind: 'analyzing', file, url })
    try {
      const report = await analyzeImage(file)
      setState({ kind: 'done', file, url, report })
    } catch (e) {
      let message = 'Something went wrong. Try again.'
      let retryable = true
      if (e instanceof KnowItError) {
        message = ERROR_HELP[e.code] ?? e.message
        if (e.code === 'RATE_LIMITED' && e.retryAfterSeconds) {
          message = `${message} Try again in about ${e.retryAfterSeconds} seconds.`
        }
        retryable = !['FILE_TOO_LARGE', 'UNSUPPORTED_TYPE', 'EMPTY_FILE', 'UNREADABLE', 'BLOCKED'].includes(e.code)
      }
      setState({ kind: 'failed', file, url, message, retryable })
    }
  }

  function onSelect(file: File) {
    void run(file, URL.createObjectURL(file))
  }

  function reset() {
    setState({ kind: 'idle' })
  }

  const context = useMemo(
    () => (state.kind === 'done' ? contextFromReport(state.report) : null),
    [state],
  )

  return (
    <div className="app">
      <header className="topbar">
        <a href="/" className="brand" onClick={(e) => { e.preventDefault(); reset() }}>
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M8 12V8h4M24 12V8h-4M8 20v4h4M24 20v4h-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="16" cy="16" r="3.4" fill="var(--amber)" />
          </svg>
          KnowIt AI
        </a>
        {state.kind !== 'idle' && (
          <button type="button" className="btn btn--quiet" onClick={reset}>
            Analyse another object
          </button>
        )}
      </header>

      <main className="main">
        {state.kind === 'idle' && <Capture onSelect={onSelect} />}

        {state.kind === 'analyzing' && (
          <section className="pending" aria-live="polite">
            <figure className="photo photo--pending">
              <img src={state.url} alt="Photo being analysed" />
              <span className="scanline" aria-hidden="true" />
            </figure>
            <div className="pending__text">
              <h2>Looking at the photo</h2>
              <p>Identifying the object, separating what is visible from what is inferred, and checking for hazards. Usually 10 to 30 seconds.</p>
            </div>
          </section>
        )}

        {state.kind === 'failed' && (
          <section className="failed">
            <figure className="photo photo--small">
              <img src={state.url} alt="Photo that could not be analysed" />
            </figure>
            <div>
              <h2>Could not analyse this photo</h2>
              <p className="notice notice--error" role="alert">{state.message}</p>
              <div className="capture__actions">
                {state.retryable && (
                  <button type="button" className="btn btn--primary" onClick={() => onSelect(state.file)}>
                    Try again
                  </button>
                )}
                <button type="button" className="btn" onClick={reset}>
                  Choose a different photo
                </button>
              </div>
            </div>
          </section>
        )}

        {state.kind === 'done' && context && (
          <>
            <Report report={state.report} imageUrl={state.url} />
            <AskPanel key={state.url} context={context} />
          </>
        )}
      </main>

      <footer className="foot">
        <p>
          KnowIt AI reads a photo and general knowledge. It cannot confirm that anything is safe,
          edible or working. Check the label, the manual, or a qualified person.
        </p>
        <p className="foot__backend">
          Connected to: {backendInfo.label}
          {backendInfo.overridden && (
            <>
              {' '}
              (<a href="?api=default">switch back</a>)
            </>
          )}
        </p>
      </footer>
    </div>
  )
}
