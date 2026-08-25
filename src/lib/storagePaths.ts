import { slugifyFileName } from './format'

/** loan-documents/{year}/{application_id}/{document_category_code}/{timestamp}_{filename} */
export function buildLoanDocumentPath(
  applicationId: string,
  documentCategoryCode: string,
  fileName: string
): string {
  const year = new Date().getFullYear()
  const safeName = slugifyFileName(fileName.replace(/\.[^.]+$/, '')) + extensionOf(fileName)
  return `${year}/${applicationId}/${documentCategoryCode}/${Date.now()}_${safeName}`
}

/** approval-packs/{application_id}/{timestamp}_{filename} */
export function buildApprovalPackPath(applicationId: string, fileName: string): string {
  return `${applicationId}/${Date.now()}_${fileName}`
}

function extensionOf(fileName: string): string {
  const match = /\.[a-zA-Z0-9]+$/.exec(fileName)
  return match ? match[0].toLowerCase() : ''
}
