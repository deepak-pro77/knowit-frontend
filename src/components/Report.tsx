import type { AnalysisResponse, Confidence, RiskLevel } from '../lib/types'

interface Props {
  report: AnalysisResponse
  imageUrl: string
}

const CONFIDENCE_TEXT: Record<Confidence, string> = {
  HIGH: 'Distinctive features or readable text support this identification.',
  MEDIUM: 'Probably right, but similar-looking objects exist.',
  LOW: 'A guess. The photo is unclear, partial, or the object is unfamiliar.',
}

const RISK_TEXT: Record<RiskLevel, string> = {
  UNKNOWN: 'Not enough evidence to assess the risk.',
  LOW: 'Lower risk than typical hazardous items. This does not mean safe.',
  MODERATE: 'Handle with care and follow the precautions below.',
  HIGH: 'Serious hazards are likely. A qualified person should handle this.',
}

function List({ items }: { items: string[] | undefined }) {
  if (!items?.length) return null
  return (
    <ul className="report__list">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

function Section({ title, children, show = true }: { title: string; children: React.ReactNode; show?: boolean }) {
  if (!show) return null
  return (
    <section className="report__section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export default function Report({ report, imageUrl }: Props) {
  const id = report.identification
  const safety = report.safety
  const confidence = id?.confidence ?? 'LOW'
  const risk = safety?.riskLevel ?? 'UNKNOWN'
  const unidentified = /unidentified/i.test(report.objectName ?? '')

  return (
    <article className="report">
      <aside className="report__aside">
        <figure className="photo">
          <img src={imageUrl} alt={`Photo analysed: ${report.objectName}`} />
        </figure>

        <div className={`stamp stamp--${risk.toLowerCase()}`} role="status">
          <span className="stamp__label">Risk level</span>
          <span className="stamp__value">{risk.charAt(0) + risk.slice(1).toLowerCase()}</span>
          <span className="stamp__note">{RISK_TEXT[risk]}</span>
        </div>

        {safety?.professionalHelpRecommended && (
          <p className="notice notice--warn">
            A qualified professional should handle this. Do not attempt repairs or disposal yourself.
          </p>
        )}

        <div className="ident">
          <h3>How this was identified</h3>
          <p className={`confidence confidence--${confidence.toLowerCase()}`}>
            <strong>{confidence.charAt(0) + confidence.slice(1).toLowerCase()} confidence.</strong>{' '}
            {CONFIDENCE_TEXT[confidence]}
          </p>

          {id?.visibleEvidence?.length > 0 && (
            <div className="ident__group ident__group--seen">
              <h4>Seen in the photo</h4>
              <List items={id.visibleEvidence} />
            </div>
          )}
          {id?.inferredDetails?.length > 0 && (
            <div className="ident__group ident__group--guessed">
              <h4>Inferred, not seen</h4>
              <List items={id.inferredDetails} />
            </div>
          )}
          {id?.alternatives?.length > 0 && (
            <div className="ident__group">
              <h4>Could also be</h4>
              <List items={id.alternatives} />
            </div>
          )}
          {id?.missingInformation?.length > 0 && (
            <div className="ident__group">
              <h4>Would help to know</h4>
              <List items={id.missingInformation} />
            </div>
          )}
        </div>
      </aside>

      <div className="report__body">
        <header className="report__head">
          {report.category && <p className="report__category">{report.category}</p>}
          <h2 className="report__name">{report.objectName}</h2>
          {report.description && <p className="report__desc">{report.description}</p>}
        </header>

        {unidentified && (
          <p className="notice">
            The object could not be identified reliably, so the sections below are general. Try a
            clearer photo, or one that shows a label or model number.
          </p>
        )}

        <Section title="Hazards to be aware of" show={!!safety?.knownHazards?.length}>
          <List items={safety.knownHazards} />
        </Section>

        <Section title="Precautions" show={!!safety?.precautions?.length}>
          <List items={safety.precautions} />
        </Section>

        <Section title="How it works" show={!!report.howItWorks}>
          <p>{report.howItWorks}</p>
        </Section>

        <Section title="Using it as intended" show={!!report.usageInstructions?.length}>
          <ol className="report__steps">
            {report.usageInstructions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Section>

        <Section title="Common uses" show={!!report.commonUses?.length}>
          <List items={report.commonUses} />
        </Section>

        {(report.advantages?.length > 0 || report.disadvantages?.length > 0) && (
          <section className="report__section">
            <h3>Strengths and weaknesses</h3>
            <div className="pros-cons">
              {report.advantages?.length > 0 && (
                <div>
                  <h4>Good at</h4>
                  <List items={report.advantages} />
                </div>
              )}
              {report.disadvantages?.length > 0 && (
                <div>
                  <h4>Less good at</h4>
                  <List items={report.disadvantages} />
                </div>
              )}
            </div>
          </section>
        )}

        <Section title="Materials" show={!!report.materials?.length}>
          <p>{report.materials.join(', ')}</p>
        </Section>

        <Section title="Worth knowing" show={!!report.interestingFacts?.length}>
          <List items={report.interestingFacts} />
        </Section>

        <Section title="Sources" show={!!report.sources?.length}>
          <ul className="report__list">
            {report.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title || s.url}
                </a>
                {!s.verified && <span className="unverified"> (not verified)</span>}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="What a photo cannot tell you" show={!!safety?.limitations?.length}>
          <List items={safety.limitations} />
        </Section>
      </div>
    </article>
  )
}
