-- Cleanup of orphan groups: groups created for checkout that never got a subscription_status
-- and whose creator abandoned the wizard >48h ago. Safe to re-run.

create or replace function public.cleanup_orphan_groups()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  -- Only allow service_role or super_admin to run this.
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  with victims as (
    select g.id
    from public.groups g
    where g.subscription_status is null
      and g.created_at < now() - interval '48 hours'
      and not exists (select 1 from public.establishments e where e.group_id = g.id)
      and not exists (select 1 from public.smarttag_orders o where o.group_id = g.id)
  ),
  deleted_roles as (
    delete from public.user_roles ur
    using victims v
    where ur.group_id = v.id
    returning ur.user_id
  )
  delete from public.groups g
  using victims v
  where g.id = v.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke execute on function public.cleanup_orphan_groups() from anon, authenticated;
grant execute on function public.cleanup_orphan_groups() to service_role;

-- Schedule daily via pg_cron if the extension is available.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'tiplink-cleanup-orphan-groups',
      '17 3 * * *',
      $cron$select public.cleanup_orphan_groups();$cron$
    );
  end if;
exception when others then
  -- pg_cron not available in this environment; skip silently.
  null;
end
$$;
