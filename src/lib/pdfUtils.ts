import { jsPDF } from 'jspdf'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export interface CapturedPage {
  id: string
  dataUrl: string // image/jpeg or image/png data URL
  rotation: 0 | 90 | 180 | 270
}

/** Combine one or more captured page images into a single multi-page PDF Blob. */
export async function buildPdfFromPages(pages: CapturedPage[]): Promise<Blob> {
  if (pages.length === 0) throw new Error('At least one page is required to build a PDF.')

  const doc = new jsPDF({ unit: 'pt' })
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const { width, height, dataUrl } = await rotateImage(page.dataUrl, page.rotation)
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const scale = Math.min(pageWidth / width, pageHeight / height)
    const renderWidth = width * scale
    const renderHeight = height * scale
    const x = (pageWidth - renderWidth) / 2
    const y = (pageHeight - renderHeight) / 2

    if (i > 0) doc.addPage()
    doc.addImage(dataUrl, 'JPEG', x, y, renderWidth, renderHeight, undefined, 'FAST')
  }
  return doc.output('blob')
}

async function rotateImage(
  dataUrl: string,
  rotation: 0 | 90 | 180 | 270
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl)
  if (rotation === 0) {
    return { dataUrl, width: img.width, height: img.height }
  }
  const canvas = document.createElement('canvas')
  const swap = rotation === 90 || rotation === 270
  canvas.width = swap ? img.height : img.width
  canvas.height = swap ? img.width : img.height
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Number of pages in a PDF ArrayBuffer. Throws if the PDF is corrupt or password protected. */
export async function getPdfPageCount(buffer: ArrayBuffer): Promise<number> {
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const count = doc.numPages
  await doc.destroy()
  return count
}

/** Renders page 1 of a PDF to a JPEG data URL, for OCR / thumbnail purposes. */
export async function renderPdfFirstPageToDataUrl(buffer: ArrayBuffer): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: 1.5 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
  await doc.destroy()
  return dataUrl
}

export type PdfLoadResult =
  | { ok: true; pageCount: number }
  | { ok: false; reason: 'password_protected' | 'corrupt' }

export async function safeInspectPdf(buffer: ArrayBuffer): Promise<PdfLoadResult> {
  try {
    const pageCount = await getPdfPageCount(buffer)
    return { ok: true, pageCount }
  } catch (err: any) {
    const name = err?.name ?? ''
    if (name === 'PasswordException') return { ok: false, reason: 'password_protected' }
    return { ok: false, reason: 'corrupt' }
  }
}
