-- 0088: admin panel — app management.
--
--   * Features & modules (platform.manage): list with how many tenants have
--     each switched on, create/edit flags (global switch, gradual rollout %),
--     delete features (modules stay). Per-tenant overrides already exist
--     (0084). The tenant app hides switched-off modules (fp_org_flags).
--   * Announcements (announcements.manage): to everyone, some plans or some
--     tenants; info / warning / critical; scheduled start and end. Tenants
--     see the current ones as a banner (fp_my_announcements) and can dismiss
--     all but critical ones; staff see how many dismissed them.
--   * App settings (platform.manage): name, languages, time zone, email
--     sender, maintenance mode (message, expected end), mobile app versions.
--     Validated; every change audited (trigger from 0083).
--   * fp_app_status() (public) also says when maintenance should end.
-- Message templates (fp_message_templates) are edited directly, guarded by
-- the 0083 policy (platform.manage) and audited.
-- Covered by supabase/security-tests/app_management.sql.

-- ===========================================================================
-- Settings
-- ===========================================================================
alter table fp_platform_settings
  add column if not exists maintenance_until timestamptz,
  add column if not exists support_email      text;

create or replace function fp_app_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'app_name', app_name,
    'maintenance_mode', maintenance_mode,
    'maintenance_message', maintenance_message,
    'maintenance_until', maintenance_until,
    'support_email', support_email,
    'mobile_min_version', mobile_min_version,
    'mobile_latest_version', mobile_latest_version,
    'mobile_force_update', mobile_force_update)
  from fp_platform_settings where id = 1;
$$;

-- "1.4.10" → {1,4,10}; null if not a version.
create or replace function fp_version_parts(v text)
returns int[]
language sql
immutable
as $$
  select case when v ~ '^\d{1,4}(\.\d{1,4}){0,2}$' then string_to_array(v, '.')::int[] end;
$$;

create or replace function fp_admin_save_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur  fp_platform_settings;
  langs text[];
begin
  perform fp_admin_require('platform.manage');
  select * into cur from fp_platform_settings where id = 1 for update;
  langs := coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'supported_lngs') x), cur.supported_lngs);

  if p ? 'app_name' and length(btrim(coalesce(p ->> 'app_name', ''))) not between 1 and 60 then
    raise exception 'invalid_app_name' using errcode = '22023', detail = 'The app name needs 1–60 characters.';
  end if;
  if cardinality(langs) = 0 or not langs <@ array['en', 'vi'] then
    raise exception 'invalid_languages' using errcode = '22023', detail = 'Choose at least one of English and Vietnamese.';
  end if;
  if coalesce(p ->> 'default_lng', cur.default_lng) <> all(langs) then
    raise exception 'invalid_default_language' using errcode = '22023', detail = 'The default language must be one of the supported languages.';
  end if;
  if p ? 'default_timezone' and not exists (select 1 from pg_timezone_names where name = p ->> 'default_timezone') then
    raise exception 'invalid_timezone' using errcode = '22023', detail = 'Unknown time zone.';
  end if;
  if nullif(p ->> 'email_from_address', '') is not null and (p ->> 'email_from_address') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023', detail = 'Enter a valid sender email address.';
  end if;
  if nullif(p ->> 'support_email', '') is not null and (p ->> 'support_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023', detail = 'Enter a valid support email address.';
  end if;
  if length(coalesce(p ->> 'maintenance_message', '')) > 500 then
    raise exception 'message_too_long' using errcode = '22023', detail = 'Keep the maintenance message under 500 characters.';
  end if;
  if (nullif(p ->> 'mobile_min_version', '') is not null and fp_version_parts(p ->> 'mobile_min_version') is null)
     or (nullif(p ->> 'mobile_latest_version', '') is not null and fp_version_parts(p ->> 'mobile_latest_version') is null) then
    raise exception 'invalid_version' using errcode = '22023', detail = 'Versions look like 1.4 or 1.4.2.';
  end if;
  if nullif(p ->> 'mobile_min_version', '') is not null and nullif(p ->> 'mobile_latest_version', '') is not null
     and fp_version_parts(p ->> 'mobile_min_version') > fp_version_parts(p ->> 'mobile_latest_version') then
    raise exception 'invalid_version' using errcode = '22023', detail = 'The minimum version can''t be newer than the latest version.';
  end if;

  update fp_platform_settings set
    app_name = coalesce(nullif(btrim(p ->> 'app_name'), ''), app_name),
    supported_lngs = langs,
    default_lng = coalesce(p ->> 'default_lng', default_lng),
    default_timezone = coalesce(p ->> 'default_timezone', default_timezone),
    email_from_name = coalesce(nullif(btrim(p ->> 'email_from_name'), ''), email_from_name),
    email_from_address = case when p ? 'email_from_address' then nullif(btrim(p ->> 'email_from_address'), '') else email_from_address end,
    support_email = case when p ? 'support_email' then nullif(btrim(p ->> 'support_email'), '') else support_email end,
    maintenance_mode = coalesce((p ->> 'maintenance_mode')::boolean, maintenance_mode),
    maintenance_message = case when p ? 'maintenance_message' then nullif(btrim(p ->> 'maintenance_message'), '') else maintenance_message end,
    maintenance_until = case when p ? 'maintenance_until' then nullif(p ->> 'maintenance_until', '')::timestamptz else maintenance_until end,
    mobile_min_version = case when p ? 'mobile_min_version' then nullif(p ->> 'mobile_min_version', '') else mobile_min_version end,
    mobile_latest_version = case when p ? 'mobile_latest_version' then nullif(p ->> 'mobile_latest_version', '') else mobile_latest_version end,
    mobile_force_update = coalesce((p ->> 'mobile_force_update')::boolean, mobile_force_update),
    updated_at = now()
  where id = 1;
end;
$$;

-- ===========================================================================
-- Features & modules
-- ===========================================================================
create or replace function fp_admin_flags()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('tenants.view');
  return coalesce((
    with orgs as (select id from fp_organizations where deleted_at is null)
    select jsonb_agg(jsonb_build_object(
             'key', f.key, 'kind', f.kind, 'description', f.description, 'enabled', f.enabled,
             'rollout_pct', f.rollout_pct, 'updated_at', f.updated_at,
             'overrides_on', (select count(*) from fp_feature_flag_overrides o where o.flag_key = f.key and o.enabled),
             'overrides_off', (select count(*) from fp_feature_flag_overrides o where o.flag_key = f.key and not o.enabled),
             'tenants_on', (select count(*) from orgs where fp_flag_enabled(f.key, orgs.id)),
             'tenants_total', (select count(*) from orgs))
           order by f.kind desc, f.key)
    from fp_feature_flags f), '[]'::jsonb);
end;
$$;

create or replace function fp_admin_save_flag(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key  text := lower(btrim(coalesce(p ->> 'key', '')));
  v_pct  int := coalesce((p ->> 'rollout_pct')::int, 100);
  v_kind text := coalesce(nullif(p ->> 'kind', ''), 'feature');
begin
  perform fp_admin_require('platform.manage');
  if v_key !~ '^[a-z0-9_.-]{2,64}$' then
    raise exception 'invalid_key' using errcode = '22023', detail = 'Use 2–64 lowercase letters, digits, dots, - or _.';
  end if;
  if v_pct < 0 or v_pct > 100 or v_kind not in ('feature', 'module') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if length(coalesce(p ->> 'description', '')) > 200 then
    raise exception 'invalid_value' using errcode = '22023', detail = 'Keep the description under 200 characters.';
  end if;
  insert into fp_feature_flags (key, kind, description, enabled, rollout_pct)
  values (v_key, v_kind, nullif(btrim(p ->> 'description'), ''), coalesce((p ->> 'enabled')::boolean, false), v_pct)
  on conflict (key) do update
    set description = coalesce(excluded.description, fp_feature_flags.description),
        enabled = coalesce((p ->> 'enabled')::boolean, fp_feature_flags.enabled),
        rollout_pct = coalesce((p ->> 'rollout_pct')::int, fp_feature_flags.rollout_pct),
        updated_at = now();
  return v_key;
end;
$$;

create or replace function fp_admin_delete_flag(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('platform.manage');
  if exists (select 1 from fp_feature_flags where key = p_key and kind = 'module') then
    raise exception 'module_flag' using errcode = '22023', detail = 'Modules can be switched off but not deleted.';
  end if;
  delete from fp_feature_flags where key = p_key;
end;
$$;

-- Audit flag and override changes (settings, announcements and templates
-- already are, 0083).
drop trigger if exists trg_admin_audit on fp_feature_flags;
create trigger trg_admin_audit after insert or update or delete on fp_feature_flags for each row execute function fp_admin_audit_trigger();

-- ===========================================================================
-- Announcements
-- ===========================================================================
create table if not exists fp_announcement_dismissals (
  announcement_id uuid not null references fp_announcements(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  at              timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table fp_announcement_dismissals enable row level security;
revoke all on fp_announcement_dismissals from anon, authenticated;

create or replace function fp_announcement_targets(a fp_announcements, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case a.audience
    when 'all' then true
    when 'plans' then coalesce((select plan_code from fp_subscriptions where org_id = p_org), 'free') = any(a.plan_codes)
    when 'tenants' then p_org = any(a.org_ids)
  end;
$$;

create or replace function fp_admin_save_announcement(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid := nullif(p ->> 'id', '')::uuid;
  v_audience text := coalesce(nullif(p ->> 'audience', ''), 'all');
  v_plans    text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'plan_codes') x), '{}');
  v_orgs     uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p -> 'org_ids') x), '{}');
  v_pub      timestamptz := nullif(p ->> 'published_at', '')::timestamptz;
  v_exp      timestamptz := nullif(p ->> 'expires_at', '')::timestamptz;
begin
  perform fp_admin_require('announcements.manage');
  if length(btrim(coalesce(p ->> 'title', ''))) not between 1 and 200 or length(btrim(coalesce(p ->> 'body', ''))) not between 1 and 5000 then
    raise exception 'text_required' using errcode = '22023', detail = 'Give a title (up to 200 characters) and a message.';
  end if;
  if coalesce(p ->> 'level', 'info') not in ('info', 'warning', 'critical') or v_audience not in ('all', 'plans', 'tenants') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if v_audience = 'plans' and (cardinality(v_plans) = 0 or exists (select 1 from unnest(v_plans) x where x not in (select code from fp_plans))) then
    raise exception 'invalid_audience' using errcode = '22023', detail = 'Choose at least one plan.';
  end if;
  if v_audience = 'tenants' and (cardinality(v_orgs) = 0 or exists (select 1 from unnest(v_orgs) x where x not in (select id from fp_organizations))) then
    raise exception 'invalid_audience' using errcode = '22023', detail = 'Choose at least one tenant.';
  end if;
  if v_exp is not null and v_exp <= coalesce(v_pub, now()) then
    raise exception 'invalid_dates' using errcode = '22023', detail = 'The end must be after the start.';
  end if;

  if v_id is null then
    insert into fp_announcements (title, body, level, audience, plan_codes, org_ids, published_at, expires_at)
    values (btrim(p ->> 'title'), btrim(p ->> 'body'), coalesce(p ->> 'level', 'info'), v_audience,
            case when v_audience = 'plans' then v_plans else '{}' end, case when v_audience = 'tenants' then v_orgs else '{}' end,
            v_pub, v_exp)
    returning id into v_id;
  else
    update fp_announcements set
      title = btrim(p ->> 'title'), body = btrim(p ->> 'body'), level = coalesce(p ->> 'level', 'info'), audience = v_audience,
      plan_codes = case when v_audience = 'plans' then v_plans else '{}' end,
      org_ids = case when v_audience = 'tenants' then v_orgs else '{}' end,
      published_at = v_pub, expires_at = v_exp
    where id = v_id;
    if not found then
      raise exception 'Announcement not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function fp_admin_announcements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform fp_admin_require('announcements.manage');
  return coalesce((
    select jsonb_agg(to_jsonb(a) || jsonb_build_object(
             'state', case when a.published_at is null then 'draft'
                           when a.published_at > now() then 'scheduled'
                           when a.expires_at is not null and a.expires_at <= now() then 'ended'
                           else 'live' end,
             'tenants', (select count(*) from fp_organizations o where o.deleted_at is null and fp_announcement_targets(a, o.id)),
             'dismissed', (select count(*) from fp_announcement_dismissals d where d.announcement_id = a.id),
             'author_email', (select email::text from auth.users where id = a.created_by))
           order by coalesce(a.published_at, a.created_at) desc)
    from fp_announcements a), '[]'::jsonb);
end;
$$;

-- Tenant app: the current announcements for this organisation that the
-- user hasn't dismissed (critical ones can't be dismissed).
create or replace function fp_my_announcements(p_org uuid)
returns table (id uuid, title text, body text, level text, published_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fp_is_member(p_org) then
    return;
  end if;
  return query
    select a.id, a.title, a.body, a.level, a.published_at
    from fp_announcements a
    where a.published_at <= now() and (a.expires_at is null or a.expires_at > now())
      and fp_announcement_targets(a, p_org)
      and (a.level = 'critical' or not exists (
            select 1 from fp_announcement_dismissals d where d.announcement_id = a.id and d.user_id = auth.uid()))
    order by case a.level when 'critical' then 0 when 'warning' then 1 else 2 end, a.published_at desc
    limit 5;
end;
$$;

create or replace function fp_dismiss_announcement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if exists (select 1 from fp_announcements where id = p_id and level <> 'critical') then
    insert into fp_announcement_dismissals (announcement_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
  end if;
end;
$$;

-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on function fp_version_parts(text), fp_admin_save_settings(jsonb), fp_admin_flags(), fp_admin_save_flag(jsonb),
  fp_admin_delete_flag(text), fp_announcement_targets(fp_announcements, uuid), fp_admin_save_announcement(jsonb),
  fp_admin_announcements(), fp_my_announcements(uuid), fp_dismiss_announcement(uuid) from public, anon, authenticated;
grant execute on function fp_admin_save_settings(jsonb), fp_admin_flags(), fp_admin_save_flag(jsonb), fp_admin_delete_flag(text),
  fp_admin_save_announcement(jsonb), fp_admin_announcements(), fp_my_announcements(uuid), fp_dismiss_announcement(uuid) to authenticated;
grant execute on function fp_app_status() to anon, authenticated;
