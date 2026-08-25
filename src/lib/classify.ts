import type { DocumentRequirement } from '@/types/database'

export interface ExtractedFields {
  pan?: string
  aadhaar?: string
  possibleName?: string
}

export interface ClassificationResult {
  bestMatch: DocumentRequirement | null
  confidence: number // 0-100
  extracted: ExtractedFields
}

const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/
const AADHAAR_REGEX = /\b\d{4}\s?\d{4}\s?\d{4}\b/
const NAME_LINE_REGEX = /(?:name|customer name)\s*[:\-]?\s*([A-Z][A-Za-z.\s]{2,40})/i

/**
 * Heuristic, client-side "AI assist" for document classification —
 * keyword/pattern matching against the requirement's configured
 * classification_keywords plus a couple of common ID-document patterns.
 * This ONLY assists identification; it never approves, rejects or waives
 * a document — a human always confirms or overrides the suggestion.
 */
export function classifyDocument(
  ocrText: string,
  fileName: string,
  requirements: DocumentRequirement[]
): ClassificationResult {
  const haystack = `${ocrText}\n${fileName}`.toLowerCase()

  let best: DocumentRequirement | null = null
  let bestScore = 0

  for (const req of requirements) {
    let score = 0
    for (const keyword of req.classification_keywords) {
      if (keyword && haystack.includes(keyword.toLowerCase())) score += 1
    }
    const nameWords = req.document_name.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    for (const word of nameWords) {
      if (haystack.includes(word)) score += 0.5
    }
    if (score > bestScore) {
      bestScore = score
      best = req
    }
  }

  const confidence = best ? Math.min(98, Math.round(55 + bestScore * 12)) : 0

  const extracted: ExtractedFields = {}
  const panMatch = PAN_REGEX.exec(ocrText.toUpperCase())
  if (panMatch) extracted.pan = panMatch[0]
  const aadhaarMatch = AADHAAR_REGEX.exec(ocrText)
  if (aadhaarMatch) extracted.aadhaar = aadhaarMatch[0]
  const nameMatch = NAME_LINE_REGEX.exec(ocrText)
  if (nameMatch) extracted.possibleName = nameMatch[1].trim()

  return { bestMatch: bestScore > 0 ? best : null, confidence, extracted }
}
