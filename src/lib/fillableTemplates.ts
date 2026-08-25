import type { LoanApplication } from '@/types/database'
import { formatDate } from './format'

export interface TemplateField {
  /** Exact AcroForm field name in the source PDF. */
  name: string
  label: string
  group: 'Terms' | 'Borrower 1' | 'Borrower 2 (Joint Applicant)'
  placeholder?: string
  /** Value pre-filled from the application record; still user-editable. */
  autoFill?: (application: LoanApplication) => string
}

/**
 * Field mapping for public/templates/A10_DPN_fillable.pdf — a real bank
 * AcroForm (Single/Joint Demand Promissory Note, document code D1, source
 * Forms/MCLR/A_10_fillable.pdf in the bank's document pack). The PDF's own
 * field names are generic (p1_field1..p1_field24); this mapping was built
 * by correlating each field's on-page position with the printed label text
 * next to it.
 */
export const ANNEXURE_TEMPLATE = {
  requirementCode: 'APP_ANNEXURE',
  templateUrl: '/templates/A10_DPN_fillable.pdf',
  title: 'Single/Joint Demand Promissory Note',
  fields: [
    { name: 'p1_field24', label: 'Branch', group: 'Terms', autoFill: (a: LoanApplication) => a.branches?.name ?? '' },
    { name: 'p1_field1', label: 'Place', group: 'Terms', autoFill: (a: LoanApplication) => a.branches?.name ?? '' },
    { name: 'p1_field2', label: 'Date', group: 'Terms', autoFill: () => formatDate(new Date()) },
    { name: 'p1_field3', label: 'Payable at (office/branch)', group: 'Terms', autoFill: (a: LoanApplication) => a.branches?.name ?? '' },
    { name: 'p1_field4', label: 'Amount (in figures, ₹)', group: 'Terms', autoFill: (a: LoanApplication) => String(a.loan_amount ?? '') },
    { name: 'p1_field5', label: 'Amount (in words)', group: 'Terms' },
    { name: 'p1_field6', label: 'Spread over MCLR (%)', group: 'Terms' },
    { name: 'p1_field7', label: 'Rests (e.g. Monthly)', group: 'Terms', placeholder: 'Monthly' },
    { name: 'p1_field8', label: 'Current MCLR (%)', group: 'Terms' },
    { name: 'p1_field9', label: 'Effective Rate of Interest (%)', group: 'Terms' },

    { name: 'p1_field10', label: 'Name', group: 'Borrower 1', autoFill: (a: LoanApplication) => a.customer_name },
    { name: 'p1_field11', label: "Son/Daughter/Wife of", group: 'Borrower 1', autoFill: (a: LoanApplication) => a.father_spouse_name ?? '' },
    { name: 'p1_field12', label: 'Age', group: 'Borrower 1' },
    { name: 'p1_field13', label: 'Address (line 1)', group: 'Borrower 1', autoFill: (a: LoanApplication) => a.address ?? '' },
    { name: 'p1_field14', label: 'Address (line 2)', group: 'Borrower 1' },
    { name: 'p1_field15', label: 'Address (line 3)', group: 'Borrower 1' },
    { name: 'p1_field16', label: 'Contact No.', group: 'Borrower 1', autoFill: (a: LoanApplication) => a.mobile_number ?? '' },

    { name: 'p1_field17', label: 'Name', group: 'Borrower 2 (Joint Applicant)' },
    { name: 'p1_field18', label: "Son/Daughter/Wife of", group: 'Borrower 2 (Joint Applicant)' },
    { name: 'p1_field19', label: 'Age', group: 'Borrower 2 (Joint Applicant)' },
    { name: 'p1_field20', label: 'Address (line 1)', group: 'Borrower 2 (Joint Applicant)' },
    { name: 'p1_field21', label: 'Address (line 2)', group: 'Borrower 2 (Joint Applicant)' },
    { name: 'p1_field22', label: 'Address (line 3)', group: 'Borrower 2 (Joint Applicant)' },
    { name: 'p1_field23', label: 'Contact No.', group: 'Borrower 2 (Joint Applicant)' },
  ] satisfies TemplateField[],
}
