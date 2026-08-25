-- ============================================================================
-- Security hardening per advisor findings:
-- 1. Pin search_path on SQL/plpgsql functions to prevent search-path hijacking.
-- 2. Trigger-only functions should never be directly callable via PostgREST RPC.
-- 3. RLS helper functions must stay executable by `authenticated` (policies
--    evaluate them as the querying role) but have no legitimate reason to be
--    callable by `anon` — the whole app requires sign-in.
-- ============================================================================

alter function set_updated_at() set search_path = public;
alter function next_application_no(text) set search_path = public;

revoke execute on function set_updated_at() from public;
revoke execute on function handle_new_auth_user() from public;
revoke execute on function guard_profile_privileged_fields() from public;

revoke execute on function auth_role() from anon;
revoke execute on function auth_branch() from anon;
revoke execute on function is_admin() from anon;
revoke execute on function can_manage_checklist() from anon;
revoke execute on function application_branch(uuid) from anon;
