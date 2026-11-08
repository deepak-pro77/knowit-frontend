// Port of the Java backend's SafetyAssessmentService. The model can suggest;
// this code decides what is allowed to reach the user. Keep both in sync.
import type { AnalysisResponse, Identification, Safety } from './types.js'

export const STANDING_LIMITATION =
  'This assessment comes from a photo and general knowledge. It cannot confirm that the object is ' +
  'safe. Check its label, manual or manufacturer.'
export const UNCERTAIN_LIMITATION =
  'The object could not be identified reliably, so no object-specific safety assessment is given.'
export const ASK_FOR_LABEL = 'A clearer photo, or a photo of its label, model number or markings'

const CONSERVATIVE_PRECAUTIONS = [
  'Do not operate, plug in, open, taste or smell the object until you have identified it.',
  'Keep it away from children and pets until it is identified.',
  'Look for a label, model number or manufacturer markings and check them against its manual.',
]

interface Rule {
  keywords: string[]
  precaution: string
  limitation: string | null
}

const RULES: Rule[] = [
  {
    keywords: ['electric', 'mains', 'voltage', 'power supply', 'charger', 'adapter', 'appliance',
      'extension cord', 'wiring', 'outlet', 'power cord', 'power plug'],
    precaution:
      'Unplug it and keep it dry before handling. Do not open it or touch exposed wires or metal ' +
      'contacts while it is connected to power.',
    limitation: 'Electrical equipment must not be assumed safe to operate just because it looks fine.',
  },
  {
    keywords: ['battery', 'lithium', 'li-ion', 'power bank'],
    precaution:
      'Keep batteries away from heat, water and metal objects. Do not charge, crush, puncture or ' +
      'use a battery that is swollen, hot or leaking.',
    limitation: "A photo cannot show a battery's condition; internal damage is not visible.",
  },
  {
    keywords: ['chemical', 'cleaner', 'bleach', 'solvent', 'pesticide', 'fuel', 'paint', 'acid',
      'detergent', 'aerosol'],
    precaution:
      'Do not taste it, mix it with other products, or let it touch skin or eyes. Read the product ' +
      'label and keep it out of reach of children.',
    limitation: 'A photo cannot show what a substance contains; follow the label and its safety data sheet.',
  },
  {
    keywords: ['knife', 'blade', 'saw', 'razor', 'needle', 'scissors', 'cutter'],
    precaution: 'Cut away from your body, keep fingers clear of the edge, and store it with the edge covered.',
    limitation: null,
  },
  {
    keywords: ['heater', 'burner', 'open flame', 'lighter', 'stove', 'soldering', 'propane', 'butane'],
    precaution:
      'Keep it away from flammable materials, never leave it unattended while hot, and let it cool ' +
      'fully before storing.',
    limitation: null,
  },
]

const CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'] as const
const RISK = ['UNKNOWN', 'LOW', 'MODERATE', 'HIGH'] as const

const list = (xs: unknown): string[] =>
  Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string') : []

const plus = (base: string[], item: string) => (base.includes(item) ? base : [...base, item])

function normalizeIdentification(id: Partial<Identification> | undefined): Identification {
  return {
    confidence: CONFIDENCE.includes(id?.confidence as never) ? id!.confidence! : 'LOW',
    visibleEvidence: list(id?.visibleEvidence),
    inferredDetails: list(id?.inferredDetails),
    alternatives: list(id?.alternatives),
    missingInformation: list(id?.missingInformation),
  }
}

function normalizeSafety(s: Partial<Safety> | undefined): Safety {
  return {
    riskLevel: RISK.includes(s?.riskLevel as never) ? s!.riskLevel! : 'UNKNOWN',
    knownHazards: list(s?.knownHazards),
    precautions: list(s?.precautions),
    limitations: list(s?.limitations),
    professionalHelpRecommended: s?.professionalHelpRecommended === true,
  }
}

function assess(r: AnalysisResponse, s: Safety): Safety {
  const text = [r.objectName, r.category, r.description, s.knownHazards.join(' ')]
    .map((x) => x ?? '')
    .join(' ')
    .toLowerCase()

  let risk = s.riskLevel
  let precautions = s.precautions
  let limitations = s.limitations
  let matched = false

  for (const rule of RULES) {
    if (!rule.keywords.some((k) => text.includes(k))) continue
    matched = true
    const mentioned = precautions.some((p) => rule.keywords.some((k) => p.toLowerCase().includes(k)))
    if (!mentioned) precautions = plus(precautions, rule.precaution)
    if (rule.limitation) limitations = plus(limitations, rule.limitation)
  }
  // A hazardous category can never be reported as merely "low" risk.
  if (matched && risk === 'LOW') risk = 'MODERATE'
  limitations = plus(limitations, STANDING_LIMITATION)
  const professional = s.professionalHelpRecommended || risk === 'HIGH'
  return { riskLevel: risk, knownHazards: s.knownHazards, precautions, limitations, professionalHelpRecommended: professional }
}

export function applySafety(input: AnalysisResponse): AnalysisResponse {
  let id = normalizeIdentification(input.identification)
  const uncertain = id.confidence === 'LOW'

  let safety: Safety
  let usage: string[]
  if (uncertain) {
    // Never invent a safety assessment for an object we could not identify.
    safety = {
      riskLevel: 'UNKNOWN',
      knownHazards: [],
      precautions: CONSERVATIVE_PRECAUTIONS,
      limitations: [UNCERTAIN_LIMITATION, STANDING_LIMITATION],
      professionalHelpRecommended: false,
    }
    usage = []
    if (id.missingInformation.length === 0) id = { ...id, missingInformation: [ASK_FOR_LABEL] }
  } else {
    safety = assess(input, normalizeSafety(input.safety))
    usage = list(input.usageInstructions)
  }

  return {
    objectName: input.objectName,
    category: input.category ?? '',
    description: input.description ?? '',
    identification: id,
    howItWorks: input.howItWorks ?? '',
    advantages: list(input.advantages),
    disadvantages: list(input.disadvantages),
    commonUses: list(input.commonUses),
    safety,
    usageInstructions: usage,
    materials: list(input.materials),
    interestingFacts: list(input.interestingFacts),
    // No source has been retrieved and verified, so none may be shown.
    sources: [],
  }
}
