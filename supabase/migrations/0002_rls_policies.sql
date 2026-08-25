-- ============================================================================
-- Row Level Security — role-based, branch-scoped access
-- Roles: admin, branch_manager, credit_officer, maker, checker
-- ============================================================================

alter table branches enable row level security;
alter table profiles enable row level security;
alter table loan_categories enable row level security;
alter table document_categories enable row level security;
alter table document_requirements enable row level security;
alter table loan_applications enable row level security;
alter table documents enable row level security;
alter table approval_packs enable row level security;
alter table email_logs enable row level security;
alter table audit_logs enable row level security;

-- ----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER to avoid recursive RLS lookups)
-- ----------------------------------------------------------------------------
create or replace function auth_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid() and active = true;
$$;

create or replace function auth_branch()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select branch_id from profiles where id = auth.uid() and active = true;
$$;

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid() and active = true), false);
$$;

create or replace function can_manage_checklist()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select role in ('admin', 'branch_manager') from profiles where id = auth.uid() and active = true), false);
$$;

create or replace function application_branch(p_application_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select branch_id from loan_applications where id = p_application_id;
$$;

-- ----------------------------------------------------------------------------
-- branches — all authenticated staff can read; only admin manages
-- ----------------------------------------------------------------------------
create policy branches_select on branches for select to authenticated using (true);
create policy branches_admin_write on branches for all to authenticated
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_self_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_write on profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- Defense in depth: profiles_self_update above lets a user update their OWN
-- row (needed so they can edit their display name), but role/branch/active
-- are privileged fields. This trigger silently discards any attempt to
-- change them unless the request is made by an admin, regardless of what
-- the RLS policy would otherwise allow — closing off privilege escalation
-- via a direct REST/RPC call.
create or replace function guard_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    new.role := old.role;
    new.branch_id := old.branch_id;
    new.active := old.active;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privileged_fields
  before update on profiles
  for each row execute function guard_profile_privileged_fields();

-- ----------------------------------------------------------------------------
-- loan_categories / document_categories / document_requirements
-- readable by everyone signed in; only admin/branch_manager can configure
-- ----------------------------------------------------------------------------
create policy loan_categories_select on loan_categories for select to authenticated using (true);
create policy loan_categories_manage on loan_categories for all to authenticated
  using (can_manage_checklist()) with check (can_manage_checklist());

create policy document_categories_select on document_categories for select to authenticated using (true);
create policy document_categories_manage on document_categories for all to authenticated
  using (can_manage_checklist()) with check (can_manage_checklist());

create policy document_requirements_select on document_requirements for select to authenticated using (true);
create policy document_requirements_manage on document_requirements for all to authenticated
  using (can_manage_checklist()) with check (can_manage_checklist());

-- ----------------------------------------------------------------------------
-- loan_applications — branch scoped, admin sees all
-- ----------------------------------------------------------------------------
create policy loan_applications_select on loan_applications for select to authenticated
  using (
    is_admin()
    or branch_id = auth_branch()
    or created_by = auth.uid()
  );

create policy loan_applications_insert on loan_applications for insert to authenticated
  with check (
    auth_role() in ('admin', 'branch_manager', 'maker')
  );

create policy loan_applications_update on loan_applications for update to authenticated
  using (
    is_admin()
    or (branch_id = auth_branch() and auth_role() in ('branch_manager', 'maker', 'credit_officer'))
  )
  with check (
    is_admin()
    or (branch_id = auth_branch() and auth_role() in ('branch_manager', 'maker', 'credit_officer'))
  );

create policy loan_applications_delete on loan_applications for delete to authenticated
  using (is_admin());

-- ----------------------------------------------------------------------------
-- documents — visibility follows the parent application's branch
-- ----------------------------------------------------------------------------
create policy documents_select on documents for select to authenticated
  using (
    is_admin() or application_branch(application_id) = auth_branch()
  );

create policy documents_insert on documents for insert to authenticated
  with check (
    auth_role() in ('admin', 'branch_manager', 'maker')
    and (is_admin() or application_branch(application_id) = auth_branch())
  );

create policy documents_update on documents for update to authenticated
  using (
    is_admin() or application_branch(application_id) = auth_branch()
  )
  with check (
    is_admin() or application_branch(application_id) = auth_branch()
  );

create policy documents_delete on documents for delete to authenticated
  using (
    is_admin()
    or (auth_role() = 'branch_manager' and application_branch(application_id) = auth_branch())
  );

-- ----------------------------------------------------------------------------
-- approval_packs
-- ----------------------------------------------------------------------------
create policy approval_packs_select on approval_packs for select to authenticated
  using (is_admin() or application_branch(application_id) = auth_branch());

create policy approval_packs_insert on approval_packs for insert to authenticated
  with check (
    auth_role() in ('admin', 'branch_manager', 'credit_officer')
    and (is_admin() or application_branch(application_id) = auth_branch())
  );

create policy approval_packs_admin_write on approval_packs for update to authenticated
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- email_logs — readable by branch staff; writes only via service-role Edge
-- Function (send-approval-pack-email), never directly from the browser.
-- ----------------------------------------------------------------------------
create policy email_logs_select on email_logs for select to authenticated
  using (is_admin() or application_branch(application_id) = auth_branch());

-- ----------------------------------------------------------------------------
-- audit_logs — append-only. Any authenticated user may write an entry
-- attributed to themselves; nobody may update or delete (immutable trail).
-- ----------------------------------------------------------------------------
create policy audit_logs_select on audit_logs for select to authenticated
  using (
    is_admin()
    or user_id = auth.uid()
    or (application_id is not null and application_branch(application_id) = auth_branch())
  );

create policy audit_logs_insert on audit_logs for insert to authenticated
  with check (user_id = auth.uid());
