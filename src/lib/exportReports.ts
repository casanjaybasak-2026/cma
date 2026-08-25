import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate, formatDateTime } from './format'
import type { ChecklistEntry } from './completeness'
import type { LoanApplication } from '@/types/database'

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '')
          return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
        })
        .join(',')
    )
    .join('\n')
}

export function buildMissingDocumentsPdf(application: LoanApplication, missing: ChecklistEntry[]): Blob {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Missing Document Report', 14, 18)
  doc.setFontSize(10)
  doc.text(`Application ID: ${application.application_no}`, 14, 26)
  doc.text(`Customer Name: ${application.customer_name}`, 14, 32)
  doc.text(`Loan Type: ${application.loan_categories?.name ?? ''}`, 14, 38)
  doc.text(`Generated: ${formatDateTime(new Date())}`, 14, 44)

  autoTable(doc, {
    startY: 52,
    head: [['#', 'Category', 'Document', 'Status', 'Remarks']],
    body: missing.map((e, i) => [
      i + 1,
      e.requirement.document_categories?.name ?? '',
      e.requirement.document_name,
      e.displayStatus.replace(/_/g, ' '),
      e.document?.remarks ?? '',
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [26, 63, 120] },
  })

  return doc.output('blob')
}

export function buildMissingDocumentsCsv(application: LoanApplication, missing: ChecklistEntry[]): Blob {
  const rows = [
    ['Application ID', application.application_no],
    ['Customer Name', application.customer_name],
    ['Loan Type', application.loan_categories?.name ?? ''],
    [],
    ['#', 'Category', 'Document', 'Status', 'Remarks'],
    ...missing.map((e, i) => [
      i + 1,
      e.requirement.document_categories?.name ?? '',
      e.requirement.document_name,
      e.displayStatus.replace(/_/g, ' '),
      e.document?.remarks ?? '',
    ]),
  ]
  return new Blob([toCsv(rows as (string | number)[][])], { type: 'text/csv;charset=utf-8' })
}

export function buildGenericReportPdf(title: string, columns: string[], rows: (string | number)[][]): Blob {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(title, 14, 18)
  doc.setFontSize(9)
  doc.text(`Generated: ${formatDateTime(new Date())}`, 14, 25)
  autoTable(doc, {
    startY: 32,
    head: [columns],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [26, 63, 120] },
  })
  return doc.output('blob')
}

export function buildGenericReportCsv(columns: string[], rows: (string | number)[][]): Blob {
  return new Blob([toCsv([columns, ...rows])], { type: 'text/csv;charset=utf-8' })
}

export function buildDocumentIndexPdf(application: LoanApplication, entries: ChecklistEntry[]): Blob {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Document Index', 14, 18)
  doc.setFontSize(10)
  doc.text(`Application ID: ${application.application_no}`, 14, 26)
  doc.text(`Customer Name: ${application.customer_name}`, 14, 32)
  doc.text(`Loan Type: ${application.loan_categories?.name ?? ''}`, 14, 38)
  doc.text(`Loan Amount: ${formatCurrency(application.loan_amount)}`, 14, 44)
  doc.text(`Generated: ${formatDateTime(new Date())}`, 14, 50)

  autoTable(doc, {
    startY: 58,
    head: [['Sr No', 'Category', 'Document Name', 'Status', 'File Name', 'Pages', 'Uploaded', 'Verified By', 'Remarks']],
    body: entries.map((e, i) => [
      i + 1,
      e.requirement.document_categories?.name ?? '',
      e.requirement.document_name,
      e.displayStatus.replace(/_/g, ' '),
      e.document?.file_name ?? '—',
      e.document?.page_count ?? '—',
      e.document ? formatDate(e.document.uploaded_at) : '—',
      e.document?.verified_by ? 'Verified' : '—',
      e.document?.remarks ?? '',
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [26, 63, 120] },
  })

  return doc.output('blob')
}
