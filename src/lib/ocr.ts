import { createWorker } from 'tesseract.js'

let workerPromise: ReturnType<typeof createWorker> | null = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng')
  }
  return workerPromise
}

/**
 * Client-side OCR (Tesseract WASM — no document ever leaves the browser
 * for text extraction). Used only to assist document classification and
 * completeness checks; it never makes an approval/rejection decision.
 */
export async function runOcr(imageDataUrl: string): Promise<string> {
  try {
    const worker = await getWorker()
    const {
      data: { text },
    } = await worker.recognize(imageDataUrl)
    return text.trim()
  } catch (err) {
    console.error('OCR failed', err)
    return ''
  }
}
