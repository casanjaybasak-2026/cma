-- ============================================================================
-- application_completeness — per-application checklist rollup used by the
-- Applications list, Dashboard and Reports so we don't N+1 query per row.
-- security_invoker ensures the view is subject to the querying user's own
-- RLS policies on loan_applications/documents, not the view owner's.
-- ============================================================================
create view application_completeness
with (security_invoker = true) as
select
  la.id as application_id,
  count(dr.id) filter (where dr.required) as total_required,
  count(d.id) filter (where dr.required and d.id is not null) as uploaded_required,
  count(d.id) filter (where dr.required and d.status in ('verified', 'waived')) as verified_required,
  count(d.id) filter (where dr.required and d.status = 'rejected') as rejected_required,
  count(d.id) filter (where dr.required and d.status = 'replace_required') as replace_required_count,
  count(dr.id) filter (where dr.required and d.id is null) as missing_required
from loan_applications la
join document_requirements dr
  on dr.loan_category_id = la.loan_category_id and dr.active = true
left join lateral (
  select d2.*
  from documents d2
  where d2.application_id = la.id
    and d2.requirement_id = dr.id
    and d2.deleted_at is null
  order by d2.version desc
  limit 1
) d on true
group by la.id;
