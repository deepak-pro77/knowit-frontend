// Mirrors the backend DTOs in com.knowitai.dto.

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type RiskLevel = 'UNKNOWN' | 'LOW' | 'MODERATE' | 'HIGH'

export interface Identification {
  confidence: Confidence
  visibleEvidence: string[]
  inferredDetails: string[]
  alternatives: string[]
  missingInformation: string[]
}

export interface Safety {
  riskLevel: RiskLevel
  knownHazards: string[]
  precautions: string[]
  limitations: string[]
  professionalHelpRecommended: boolean
}

export interface Source {
  title: string
  url: string
  verified: boolean
}

export interface AnalysisResponse {
  objectName: string
  category: string
  description: string
  identification: Identification
  howItWorks: string
  advantages: string[]
  disadvantages: string[]
  commonUses: string[]
  safety: Safety
  usageInstructions: string[]
  materials: string[]
  interestingFacts: string[]
  sources: Source[]
}

export interface AskContext {
  objectName: string
  category?: string
  description?: string
  knownHazards?: string[]
  precautions?: string[]
}

export interface AskRequest {
  question: string
  context: AskContext
}

export interface AskResponse {
  answer: string
}

export interface ApiError {
  code: string
  message: string
}
