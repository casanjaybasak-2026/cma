-- ============================================================================
-- Private storage buckets + object-level RLS
--
-- loan-documents/{year}/{application_id}/{document_category_folder}/{file}
-- approval-packs/{application_id}/{zip_file_name}
--
-- Both buckets are PRIVATE. All reads must go through short-lived signed
-- URLs generated client-side via supabase.storage.from(bucket).createSignedUrl,
-- which is itself gated by these RLS policies — there is no public access.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('loan-documents', 'loan-documents', false, 26214400,
    array['application/pdf','image/jpeg','image/png','image/webp']),
  ('approval-packs', 'approval-packs', false, 209715200,
    array['application/zip','application/pdf'])
on conflict (id) do nothing;

-- loan-documents: application id is the 2nd path segment ({year}/{app_id}/{cat}/{file})
create policy loan_documents_select on storage.objects for select to authenticated
  using (
    bucket_id = 'loan-documents'
    and (
      is_admin()
      or application_branch(((storage.foldername(name))[2])::uuid) = auth_branch()
    )
  );

create policy loan_documents_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'loan-documents'
    and auth_role() in ('admin', 'branch_manager', 'maker')
    and (
      is_admin()
      or application_branch(((storage.foldername(name))[2])::uuid) = auth_branch()
    )
  );

create policy loan_documents_update on storage.objects for update to authenticated
  using (
    bucket_id = 'loan-documents'
    and (
      is_admin()
      or application_branch(((storage.foldername(name))[2])::uuid) = auth_branch()
    )
  );

create policy loan_documents_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'loan-documents'
    and (
      is_admin()
      or (auth_role() = 'branch_manager'
          and application_branch(((storage.foldername(name))[2])::uuid) = auth_branch())
    )
  );

-- approval-packs: application id is the 1st path segment ({app_id}/{file})
create policy approval_packs_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'approval-packs'
    and (
      is_admin()
      or application_branch(((storage.foldername(name))[1])::uuid) = auth_branch()
    )
  );

create policy approval_packs_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'approval-packs'
    and auth_role() in ('admin', 'branch_manager', 'credit_officer')
    and (
      is_admin()
      or application_branch(((storage.foldername(name))[1])::uuid) = auth_branch()
    )
  );

create policy approval_packs_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'approval-packs' and is_admin());
