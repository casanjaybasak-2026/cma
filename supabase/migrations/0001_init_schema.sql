-- ============================================================================
-- Bank Loan Document Scanner & Approval Pack — core schema
-- ============================================================================
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type user_role as enum (
  'admin',
  'branch_manager',
  'credit_officer',
  'maker',
  'checker'
);

create type application_status as enum (
  'draft',
  'in_progress',
  'pending_verification',
  'ready_for_approval',
  'approved',
  'rejected',
  'on_hold'
);

create type document_status as enum (
  'pending',
  'uploaded',
  'processing',
  'submitted_for_verification',
  'verified',
  'rejected',
  'replace_required',
  'optional',
  'waived'
);

create type approval_pack_status as enum (
  'final',
  'with_exceptions'
);

create type email_status as enum (
  'pending',
  'sent',
  'failed'
);

-- ----------------------------------------------------------------------------
-- branches
-- ----------------------------------------------------------------------------
create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role user_role not null default 'maker',
  branch_id uuid references branches(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on profiles(role);
create index profiles_branch_idx on profiles(branch_id);

-- ----------------------------------------------------------------------------
-- loan_categories  (admin-configurable — new products need no code changes)
-- ----------------------------------------------------------------------------
create table loan_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sequence int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- document_categories  (KYC, APPLICATION, FINANCIAL, SECURITY, LOAN_SPECIFIC, OTHER, ...)
-- ----------------------------------------------------------------------------
create table document_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  folder_prefix text not null,
  sequence int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- document_requirements  (the configurable checklist engine)
-- ----------------------------------------------------------------------------
create table document_requirements (
  id uuid primary key default gen_random_uuid(),
  loan_category_id uuid not null references loan_categories(id) on delete cascade,
  document_category_id uuid not null references document_categories(id),
  document_name text not null,
  code text not null,
  required boolean not null default true,
  sequence int not null default 0,
  active boolean not null default true,
  classification_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_category_id, code)
);

create index document_requirements_category_idx on document_requirements(loan_category_id);

-- ----------------------------------------------------------------------------
-- loan_applications
-- ----------------------------------------------------------------------------
create table loan_applications (
  id uuid primary key default gen_random_uuid(),
  application_no text not null unique,
  customer_id text not null,
  customer_name text not null,
  father_spouse_name text,
  mobile_number text not null,
  email text,
  address text,
  branch_id uuid references branches(id),
  branch_code text,
  loan_category_id uuid not null references loan_categories(id),
  loan_amount numeric(16,2) not null default 0,
  application_date date not null default current_date,
  relationship_manager text,
  credit_officer text,
  sanction_status text not null default 'Pending',
  remarks text,
  status application_status not null default 'draft',
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index loan_applications_status_idx on loan_applications(status);
create index loan_applications_category_idx on loan_applications(loan_category_id);
create index loan_applications_branch_idx on loan_applications(branch_id);
create index loan_applications_customer_idx on loan_applications(customer_name);
create index loan_applications_search_idx on loan_applications
  using gin (to_tsvector('simple',
    coalesce(application_no,'') || ' ' || coalesce(customer_id,'') || ' ' ||
    coalesce(customer_name,'') || ' ' || coalesce(mobile_number,'')));

-- ----------------------------------------------------------------------------
-- documents
-- ----------------------------------------------------------------------------
create table documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references loan_applications(id) on delete cascade,
  requirement_id uuid references document_requirements(id),
  file_name text not null,
  storage_path text not null,
  file_type text not null,
  file_size bigint not null default 0,
  page_count int not null default 1,
  ocr_text text,
  document_type text,
  classification_confidence numeric(5,2),
  status document_status not null default 'uploaded',
  quality_flags jsonb not null default '[]'::jsonb,
  version int not null default 1,
  replaced_document_id uuid references documents(id),
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  submitted_for_verification_by uuid references profiles(id),
  submitted_for_verification_at timestamptz,
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  remarks text,
  deleted_at timestamptz
);

create index documents_application_idx on documents(application_id);
create index documents_requirement_idx on documents(requirement_id);
create index documents_status_idx on documents(status);

-- ----------------------------------------------------------------------------
-- approval_packs
-- ----------------------------------------------------------------------------
create table approval_packs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references loan_applications(id) on delete cascade,
  zip_file_path text not null,
  document_count int not null default 0,
  total_size_bytes bigint not null default 0,
  status approval_pack_status not null default 'final',
  exceptions jsonb not null default '[]'::jsonb,
  exception_remarks text,
  missing_documents jsonb not null default '[]'::jsonb,
  generated_by uuid references profiles(id),
  generated_at timestamptz not null default now()
);

create index approval_packs_application_idx on approval_packs(application_id);

-- ----------------------------------------------------------------------------
-- email_logs
-- ----------------------------------------------------------------------------
create table email_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references loan_applications(id) on delete cascade,
  approval_pack_id uuid references approval_packs(id),
  recipient text not null,
  cc text,
  bcc text,
  subject text not null,
  message text,
  sent_by uuid references profiles(id),
  sent_at timestamptz not null default now(),
  status email_status not null default 'pending',
  message_id text,
  error_message text
);

create index email_logs_application_idx on email_logs(application_id);

-- ----------------------------------------------------------------------------
-- audit_logs
-- ----------------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  application_id uuid references loan_applications(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  timestamp timestamptz not null default now()
);

create index audit_logs_application_idx on audit_logs(application_id);
create index audit_logs_user_idx on audit_logs(user_id);
create index audit_logs_timestamp_idx on audit_logs(timestamp desc);

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger loan_categories_set_updated_at before update on loan_categories
  for each row execute function set_updated_at();
create trigger document_requirements_set_updated_at before update on document_requirements
  for each row execute function set_updated_at();
create trigger loan_applications_set_updated_at before update on loan_applications
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up / is invited.
-- Role/branch/name are read from the invite metadata set by an admin.
-- ----------------------------------------------------------------------------
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, branch_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'maker'),
    nullif(new.raw_user_meta_data ->> 'branch_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- Application-number sequence generator: BANKLOAN-YYYY-##### style helper
-- ----------------------------------------------------------------------------
create sequence if not exists application_no_seq;

create or replace function next_application_no(p_prefix text default 'APP')
returns text
language sql
as $$
  select p_prefix || '-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('application_no_seq')::text, 5, '0');
$$;
