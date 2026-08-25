-- ============================================================================
-- LOCAL / DEV DEMO DATA ONLY.
-- This file is run by `supabase db reset` for local development. It is NOT
-- part of the migration history and must never be applied to a production
-- project. It creates demo login users and sample (non-real, synthetic)
-- loan applications so the app can be explored end-to-end.
--
-- Demo credentials (change immediately if ever used outside local dev):
--   admin@bank.demo     / Demo@12345   (Admin)
--   manager@bank.demo   / Demo@12345   (Branch Manager)
--   credit@bank.demo    / Demo@12345   (Credit Officer)
--   maker@bank.demo     / Demo@12345   (Maker)
--   checker@bank.demo   / Demo@12345   (Checker)
-- ============================================================================

do $$
declare
  v_branch_mgr uuid;
  v_admin_id uuid;
  v_manager_id uuid;
  v_credit_id uuid;
  v_maker_id uuid;
  v_checker_id uuid;
  v_cc_cat uuid;
  v_tl_cat uuid;
  v_hl_cat uuid;
  v_el_cat uuid;
begin
  select id into v_branch_mgr from branches where code = 'BR-MGR-001';

  -- ---- demo auth users -----------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token
  ) values
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'admin@bank.demo', crypt('Demo@12345', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Ananya Rao","role":"admin"}', now(), now(), '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'manager@bank.demo', crypt('Demo@12345', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Vikram Shah","role":"branch_manager"}', now(), now(), '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'credit@bank.demo', crypt('Demo@12345', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Priya Menon","role":"credit_officer"}', now(), now(), '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'maker@bank.demo', crypt('Demo@12345', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Rahul Verma","role":"maker"}', now(), now(), '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'checker@bank.demo', crypt('Demo@12345', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Sana Iyer","role":"checker"}', now(), now(), '', '');

  select id into v_admin_id from auth.users where email = 'admin@bank.demo';
  select id into v_manager_id from auth.users where email = 'manager@bank.demo';
  select id into v_credit_id from auth.users where email = 'credit@bank.demo';
  select id into v_maker_id from auth.users where email = 'maker@bank.demo';
  select id into v_checker_id from auth.users where email = 'checker@bank.demo';

  update profiles set branch_id = v_branch_mgr where id in (v_admin_id, v_manager_id, v_credit_id, v_maker_id, v_checker_id);

  select id into v_cc_cat from loan_categories where code = 'CC';
  select id into v_tl_cat from loan_categories where code = 'TERM_LOAN';
  select id into v_hl_cat from loan_categories where code = 'HOME_LOAN';
  select id into v_el_cat from loan_categories where code = 'EDUCATION_LOAN';

  -- ---- demo loan applications -----------------------------------------------
  insert into loan_applications (
    application_no, customer_id, customer_name, father_spouse_name, mobile_number, email,
    address, branch_id, branch_code, loan_category_id, loan_amount, application_date,
    relationship_manager, credit_officer, sanction_status, remarks, status, created_by
  ) values
  (next_application_no('CC'), 'CUST-10001', 'ABC Traders', 'Proprietor: Suresh Kumar', '9876543210',
    'accounts@abctraders.example', '221 Market Street, Bengaluru', v_branch_mgr, 'BR-MGR-001',
    v_cc_cat, 2500000, current_date - interval '5 days', 'Vikram Shah', 'Priya Menon',
    'Pending', 'Existing CC account renewal', 'in_progress', v_maker_id),
  (next_application_no('TL'), 'CUST-10002', 'XYZ Industries Pvt Ltd', 'Director: Manoj Gupta', '9876500001',
    'finance@xyzindustries.example', 'Plot 14, MIDC Industrial Area, Mumbai', v_branch_mgr, 'BR-MGR-001',
    v_tl_cat, 5000000, current_date - interval '3 days', 'Vikram Shah', 'Priya Menon',
    'Pending', 'New machinery purchase term loan', 'in_progress', v_maker_id),
  (next_application_no('HL'), 'CUST-10003', 'Demo Customer', 'Spouse: Demo Spouse', '9876500002',
    'demo.customer@example.com', '7 Lake View Apartments, Bengaluru', v_branch_mgr, 'BR-MGR-001',
    v_hl_cat, 4200000, current_date - interval '2 days', 'Vikram Shah', 'Priya Menon',
    'Pending', 'Resale flat purchase', 'draft', v_maker_id),
  (next_application_no('EL'), 'CUST-10004', 'Demo Student', 'Father: Demo Parent', '9876500003',
    'demo.student@example.com', '18 College Road, Bengaluru', v_branch_mgr, 'BR-MGR-001',
    v_el_cat, 1200000, current_date - interval '1 days', 'Vikram Shah', 'Priya Menon',
    'Pending', 'Masters abroad — admission confirmed', 'draft', v_maker_id);
end $$;
