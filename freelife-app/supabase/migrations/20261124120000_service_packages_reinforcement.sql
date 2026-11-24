-- service_packages_reinforcement
-- Additive only: no table/column dropped, no row deleted, no RLS policy or GRANT changes.
-- Service types: consult (90 分鐘諮詢) | package (標準專案包) | retainer (月費顧問)
--   consult / package  -> exactly 3 tiers basic/standard/premium, all billing_period = 'one_time'
--   retainer           -> exactly 1 package, tier = 'basic' slot, billing_period = 'monthly'
-- The retainer reuses the existing 'basic' tier slot so the current tier CHECK,
-- UNIQUE(service_id, tier), orders.package_tier CHECK and create_order() keep working unchanged.

-- 1) services --------------------------------------------------------------
alter table public.services
  add column if not exists service_type text not null default 'package',
  add column if not exists published_at timestamptz;

alter table public.services
  add constraint services_service_type_check
    check (service_type in ('consult', 'package', 'retainer')),
  add constraint services_category_check
    check (category in ('行銷公關','品牌設計','B2B 業務開發','網站與數位開發',
                        '營運流程優化','內容與文案','數據分析','財務法務')),
  add constraint services_description_len_check
    check (char_length(description) <= 5000),
  add constraint services_images_len_check
    check (jsonb_array_length(images) <= 8);

-- Backfill only the new column (existing 5 services = 'package' via default).
update public.services
   set published_at = created_at
 where status = 'active' and published_at is null;

create index if not exists services_active_created_idx
  on public.services (created_at desc)
  where status = 'active';

-- 2) service_packages ------------------------------------------------------
alter table public.service_packages
  add column if not exists name text not null default '',
  add column if not exists billing_period text not null default 'one_time',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.service_packages
  add constraint service_packages_billing_period_check
    check (billing_period in ('one_time', 'monthly')),
  add constraint service_packages_name_len_check
    check (char_length(name) <= 40),
  add constraint service_packages_price_max_check
    check (price <= 10000000),
  add constraint service_packages_delivery_max_check
    check (delivery_days <= 365),
  add constraint service_packages_revisions_max_check
    check (revisions <= 20),
  add constraint service_packages_features_len_check
    check (jsonb_array_length(features) <= 12);

drop trigger if exists service_packages_set_updated_at on public.service_packages;
create trigger service_packages_set_updated_at
  before update on public.service_packages
  for each row execute function public.set_updated_at();

-- 3) Publish guard (services) ---------------------------------------------
-- Fires when a row becomes 'active', or when an active row changes service_type.
create or replace function public.guard_service_publish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n_total   integer;
  n_tiers   integer;
  n_monthly integer;
  n_basic   integer;
begin
  if new.status = 'active'
     and (tg_op = 'INSERT'
          or old.status is distinct from 'active'
          or old.service_type is distinct from new.service_type) then

    select count(*),
           count(distinct sp.tier),
           count(*) filter (where sp.billing_period = 'monthly'),
           count(*) filter (where sp.tier = 'basic')
      into n_total, n_tiers, n_monthly, n_basic
      from public.service_packages as sp
     where sp.service_id = new.id;

    if new.service_type = 'retainer' then
      if n_total <> 1 or n_basic <> 1 or n_monthly <> 1 then
        raise exception 'retainer_needs_one_monthly_package' using errcode = '23514';
      end if;
    else
      if n_tiers < 3 then
        raise exception 'service_needs_three_packages' using errcode = '23514';
      end if;
      if n_monthly > 0 then
        raise exception 'one_time_service_has_monthly_package' using errcode = '23514';
      end if;
    end if;

    if not exists (
      select 1 from public.talent_profiles as t
       where t.user_id = new.talent_id and t.onboarded
    ) then
      raise exception 'talent_profile_not_onboarded' using errcode = '23514';
    end if;

    if new.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists services_guard_publish on public.services;
create trigger services_guard_publish
  before insert or update of status, service_type on public.services
  for each row execute function public.guard_service_publish();

-- 4) Package guard (service_packages) --------------------------------------
-- While the parent service is 'active':
--   * no deleting a package (pause first)
--   * no adding a package / changing tier or billing that would break the shape
--     (retainer: only tier 'basic' + monthly; others: one_time only)
-- Price / days / revisions / features / name edits on an active service stay allowed.
-- Drafts and paused services can be edited freely; the publish guard checks them on publish.
create or replace function public.guard_service_package()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  svc_status text;
  svc_type   text;
  target     uuid;
begin
  target := case when tg_op = 'DELETE' then old.service_id else new.service_id end;

  select s.status, s.service_type into svc_status, svc_type
    from public.services as s
   where s.id = target;

  -- parent missing (e.g. cascade from deleting the service) or not live: allow
  if svc_status is distinct from 'active' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'pause_service_before_removing_package' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.service_id is distinct from old.service_id then
    raise exception 'package_cannot_move_service' using errcode = '23514';
  end if;

  if svc_type = 'retainer' then
    if new.tier <> 'basic' or new.billing_period <> 'monthly' then
      raise exception 'retainer_needs_one_monthly_package' using errcode = '23514';
    end if;
  else
    if new.billing_period <> 'one_time' then
      raise exception 'one_time_service_has_monthly_package' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists service_packages_guard on public.service_packages;
create trigger service_packages_guard
  before insert or update or delete on public.service_packages
  for each row execute function public.guard_service_package();

-- Trigger-only functions: not callable as RPC (postgres default ACL already
-- grants EXECUTE to postgres only; this just makes it explicit).
revoke execute on function public.guard_service_publish() from public, anon, authenticated;
revoke execute on function public.guard_service_package() from public, anon, authenticated;
