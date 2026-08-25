import type { DocumentRow, QualityFlag } from '@/types/database'
import { loadImage } from './pdfUtils'

const LOW_RESOLUTION_THRESHOLD_PX = 600

export async function checkImageQuality(dataUrl: string): Promise<QualityFlag[]> {
  const flags: QualityFlag[] = []
  const img = await loadImage(dataUrl)

  if (img.width < LOW_RESOLUTION_THRESHOLD_PX || img.height < LOW_RESOLUTION_THRESHOLD_PX) {
    flags.push({
      type: 'low_resolution',
      message: `Image resolution (${img.width}×${img.height}px) is lower than the recommended minimum of ${LOW_RESOLUTION_THRESHOLD_PX}px.`,
    })
  }

  const blank = await isLikelyBlank(img)
  if (blank) {
    flags.push({ type: 'blank_page', message: 'This page appears to be blank or almost entirely white.' })
  }

  return flags
}

async function isLikelyBlank(img: HTMLImageElement): Promise<boolean> {
  const canvas = document.createElement('canvas')
  const sampleSize = 100
  canvas.width = sampleSize
  canvas.height = sampleSize
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.drawImage(img, 0, 0, sampleSize, sampleSize)
  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize)

  let sum = 0
  let sumSquares = 0
  const n = sampleSize * sampleSize
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3
    sum += gray
    sumSquares += gray * gray
  }
  const mean = sum / n
  const variance = sumSquares / n - mean * mean
  // Near-uniform, very light image => probably blank / unreadable
  return variance < 25 && mean > 230
}

export function checkPdfQuality(result: { ok: boolean; reason?: string }): QualityFlag[] {
  if (result.ok) return []
  if (result.reason === 'password_protected') {
    return [{ type: 'password_protected', message: 'This PDF appears to be password protected.' }]
  }
  return [{ type: 'corrupt_file', message: 'This file could not be read. It may be corrupt.' }]
}

export function checkDuplicate(
  fileName: string,
  fileSize: number,
  existingDocuments: DocumentRow[]
): QualityFlag[] {
  const duplicate = existingDocuments.find(
    (d) => d.file_name === fileName && d.file_size === fileSize && !d.deleted_at
  )
  if (duplicate) {
    return [
      {
        type: 'duplicate',
        message: `A document with the same name and size ("${fileName}") already exists on this application.`,
      },
    ]
  }
  return []
}

export function checkWrongDocumentType(
  targetRequirementId: string | null,
  classifiedRequirementId: string | null,
  confidence: number
): QualityFlag[] {
  if (!targetRequirementId || !classifiedRequirementId) return []
  if (classifiedRequirementId !== targetRequirementId && confidence >= 60) {
    return [
      {
        type: 'wrong_document_type',
        message: 'The scanned content does not appear to match the selected checklist item.',
      },
    ]
  }
  return []
}
