# Bank Loan Document Scanner & Approval Pack

A production-quality foundation for a bank-grade loan documentation and
approval-pack workflow: scan/upload KYC, financial, security and
loan-specific documents against a configurable checklist, track
completeness and verification, and generate + email a ZIP approval pack —
all backed by Supabase (Postgres + Row Level Security, Storage, Auth, Edge
Functions).

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS, React Router, TanStack Query
- **Backend**: Supabase — PostgreSQL, Row Level Security, Storage (private buckets), Auth, Edge Functions (Deno)
- **Document processing**: `pdfjs-dist` (preview/inspection), `jsPDF` (multi-page scan → PDF, reports), `tesseract.js` (client-side OCR), `jszip` (approval-pack ZIP)
- **Email**: Supabase Edge Function → Resend API (server-side only; API key never reaches the browser)

## Repository Layout

```
supabase/
  config.toml                 Local Supabase CLI config
  migrations/                 Schema, RLS policies, storage buckets, reference data, views
  seed.sql                    LOCAL/DEV ONLY demo users + demo applications
  functions/
    send-approval-pack-email/ Edge Function: signed link + Resend email + audit log
    _shared/                  CORS helper
src/
  components/                 UI building blocks, grouped by feature
  contexts/                   Auth + Toast providers
  hooks/                      Supabase/react-query data hooks
  lib/                        Business logic: OCR, classification, quality checks,
                               completeness/readiness, ZIP pack builder, exports, audit
  pages/                      Routed pages
  types/                      Hand-written DB row types
```

## 1. Provision Supabase

1. Create a Supabase project (supabase.com) or run `supabase start` locally with the Supabase CLI.
2. Apply the schema:
   ```
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   This runs `supabase/migrations/*.sql` in order: schema → RLS policies → storage buckets → reference data (loan categories & document checklist) → reporting views.
3. **Local/dev only** — seed demo users and sample applications:
   ```
   supabase db reset   # runs migrations + supabase/seed.sql
   ```
   `seed.sql` is intentionally **not** a migration — never run it against a real production project. It creates 5 demo logins (see below) and 4 sample applications (CC, Term Loan, Home Loan, Education Loan) with synthetic, non-real data.
4. Deploy the email Edge Function and set its secrets (server-side only):
   ```
   supabase functions deploy send-approval-pack-email
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... RESEND_API_KEY=... EMAIL_FROM_ADDRESS=loans@yourbank.example
   ```

## 2. Configure the Frontend

```
cp .env.example .env
```
Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the **publishable/anon** key only — never the service role key). Then:

```
npm install
npm run dev       # start dev server
npm run build     # type-check + production build
```

## 3. Demo Credentials (local/dev seed only)

| Role | Email | Password |
|---|---|---|
| Admin | admin@bank.demo | Demo@12345 |
| Branch Manager | manager@bank.demo | Demo@12345 |
| Credit Officer | credit@bank.demo | Demo@12345 |
| Maker | maker@bank.demo | Demo@12345 |
| Checker | checker@bank.demo | Demo@12345 |

Change or remove these before any non-local use.

## Architecture Notes

**Configurable checklist engine.** `loan_categories`, `document_categories` and
`document_requirements` are plain data — admins add a new loan product or
change a checklist from Settings, with zero code changes. `document_requirements`
also carries `classification_keywords`, used by the client-side classification
heuristic.

**Security model.**
- Every table has RLS enabled; access is role- and branch-scoped via
  `SECURITY DEFINER` helper functions (`auth_role()`, `auth_branch()`, `is_admin()`).
- A `BEFORE UPDATE` trigger (`guard_profile_privileged_fields`) blocks any
  non-admin from escalating their own `role`/`branch_id`/`active` via a direct
  API call, even though the permissive self-update policy allows editing
  one's own profile row (for name changes).
- Storage buckets (`loan-documents`, `approval-packs`) are **private**; all
  reads go through short-lived signed URLs (`createSignedUrl`), gated by the
  same RLS rules via `storage.foldername(name)` path parsing. There is no
  public document URL anywhere in the app.
- The email API key and the Supabase **service role** key are only ever
  read inside the `send-approval-pack-email` Edge Function — never shipped
  to the browser. The function independently re-checks the caller's role
  and branch before it will touch a document.
- Every consequential action (create, upload, replace, verify, reject,
  delete, ZIP generation — including "Generate With Exceptions" and its
  remarks —, email send/fail) writes an immutable row to `audit_logs`
  (insert-only policy; no update/delete policy exists for any role).
- The frontend enforces an idle session timeout (`VITE_SESSION_TIMEOUT_MINUTES`,
  default 20 minutes) and signs the user out automatically.

**OCR & classification stay assistive, never authoritative.** OCR runs
fully client-side via `tesseract.js` (WASM) — no third-party OCR API, no
document leaves the browser for text extraction. Classification
(`src/lib/classify.ts`) is keyword/pattern matching against the
requirement's configured keywords plus PAN/Aadhaar regexes; it always
requires a human Confirm/Reclassify/Reject before saving, and never
verifies, rejects, or waives a document on its own.

**Quality checks** (`src/lib/qualityChecks.ts`) flag blank pages, low
resolution, password-protected/corrupt PDFs, likely duplicates and
mismatched document types — surfaced as warnings that an authorized user
can explicitly override (recorded in `documents.quality_flags`).

**Approval pack generation** (`src/lib/generateApprovalPack.ts`) blocks a
"final" ZIP unless every mandatory document is uploaded and verified; an
authorized user (Admin/Branch Manager/Credit Officer) can instead choose
**Generate With Exceptions**, which requires remarks and is recorded on the
`approval_packs` row and in the audit trail. The ZIP mirrors the folder
structure and sequential numbering described in the spec, plus a generated
`00_INDEX/Document_Index.pdf` and `Missing_Document_Report.pdf`.

**Maker-checker workflow** is optional and status-driven: `uploaded` →
(Maker) `Submit for Verification` → `submitted_for_verification` →
(Checker/Credit Officer) `Verify`/`Reject`. Both users are captured on the
document row (`uploaded_by`, `submitted_for_verification_by`, `verified_by`)
and in the audit log.

## Known Limitations / Follow-ups

- Deactivating a user in Settings revokes their data access immediately
  (RLS helper functions require `active = true`), but does not block their
  Supabase Auth login itself — fully disabling sign-in requires the
  Supabase Auth Admin API (service role), which only ever runs server-side.
- Malware/virus scanning is not wired to a scanning engine ("where
  infrastructure permits" per the brief) — file-type and size validation
  are enforced client-side and via storage bucket `allowed_mime_types`.
- CSV export is used as the "Excel" export format everywhere (opens
  natively in Excel) rather than a binary `.xlsx`, to avoid an extra heavy
  dependency in this foundation.
- The production bundle currently ships `tesseract.js`/`pdfjs-dist`/`jspdf`
  in the main chunk; splitting these behind dynamic `import()` on the
  scanner route would reduce initial load size for a high-traffic deployment.
