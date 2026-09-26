-- 0092_display_boards.sql
-- TV display boards: a link that shows live work order status on a screen
-- (like a restaurant "order ready" board). Covered by
-- supabase/security-tests/display_boards.sql.
--
--   * Org admins and managers create a board: a name, which site (or all),
--     which statuses, which details (priority, due date, location, assignee,
--     asset), layout (status columns or a list), theme and language, and for
--     how long finished work stays in the "Done" column.
--   * The board has a secret link (/display/<32 hex characters>). Anyone with
--     the link sees the board without signing in, so it only ever returns
--     what the screen shows: title, short reference, status, priority, dates,
--     location, asset name and the assignee's first name. Never instructions,
--     requester details, costs or anything else.
--   * Links can be switched off, or replaced with a new link (the old one
--     stops working at once). A board of a suspended or deleted organisation
--     shows nothing.

create table if not exists fp_display_boards (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references fp_organizations(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 80),
  token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  site_id       uuid references fp_sites(id) on delete set null,
  statuses      text[] not null default array['open', 'assigned', 'in_progress', 'on_hold', 'resolved']
                  check (statuses <@ array['open', 'assigned', 'in_progress', 'on_hold', 'resolved', 'verified', 'closed'] and cardinality(statuses) > 0),
  fields        text[] not null default array['priority', 'due', 'location', 'assignee']
                  check (fields <@ array['priority', 'due', 'location', 'assignee', 'asset', 'created']),
  priorities    text[] check (priorities is null or priorities <@ array['low', 'medium', 'high', 'critical']),
  layout        text not null default 'columns' check (layout in ('columns', 'list')),
  theme         text not null default 'dark' check (theme in ('dark', 'light')),
  lng           text not null default 'en' check (lng in ('en', 'vi')),
  done_hours    int not null default 4 check (done_hours between 0 and 72),
  active        boolean not null default true,
  last_seen_at  timestamptz,
  created_by    uuid references auth.users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists fp_display_boards_org_idx on fp_display_boards (org_id, created_at desc);

alter table fp_display_boards enable row level security;
-- Org admins and managers see and manage their boards; the token is the
-- secret, so nobody else reads the table. Writes go through the functions.
drop policy if exists display_boards_select on fp_display_boards;
create policy display_boards_select on fp_display_boards for select to authenticated
  using ( fp_has_role(org_id, array['org_admin', 'manager']) );
revoke all on fp_display_boards from anon;
revoke insert, update, delete on fp_display_boards from authenticated;
grant select on fp_display_boards to authenticated;

-- ===========================================================================
-- Manage (org admins and managers)
-- ===========================================================================
-- A JSON array of strings as text[]; null for anything else (JSON null
-- means "all" for priorities).
create or replace function fp_jsonb_text_array(j jsonb)
returns text[]
language sql
immutable
as $$
  select case when jsonb_typeof(j) = 'array' then coalesce((select array_agg(x) from jsonb_array_elements_text(j) x), '{}') end;
$$;

create or replace function fp_save_display_board(p jsonb)
returns fp_display_boards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid := nullif(p ->> 'id', '')::uuid;
  v_org  uuid;
  v_site uuid := nullif(p ->> 'site_id', '')::uuid;
  r      fp_display_boards;
begin
  if v_id is null then
    v_org := (p ->> 'org_id')::uuid;
  else
    select org_id into v_org from fp_display_boards where id = v_id;
  end if;
  if v_org is null or not fp_has_role(v_org, array['org_admin', 'manager']) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_site is not null and not exists (select 1 from fp_sites where id = v_site and org_id = v_org) then
    raise exception 'Site not found' using errcode = 'P0002';
  end if;
  if v_id is null and (select count(*) from fp_display_boards where org_id = v_org) >= 20 then
    raise exception 'display_board_limit';
  end if;

  if v_id is null then
    insert into fp_display_boards (org_id, name, site_id, statuses, fields, priorities, layout, theme, lng, done_hours)
    values (v_org, btrim(p ->> 'name'), v_site,
            coalesce(fp_jsonb_text_array(p -> 'statuses'), array['open', 'assigned', 'in_progress', 'on_hold', 'resolved']),
            coalesce(fp_jsonb_text_array(p -> 'fields'), '{}'),
            fp_jsonb_text_array(p -> 'priorities'),
            coalesce(p ->> 'layout', 'columns'), coalesce(p ->> 'theme', 'dark'), coalesce(p ->> 'lng', 'en'),
            coalesce((p ->> 'done_hours')::int, 4))
    returning * into r;
  else
    update fp_display_boards set
      name       = btrim(p ->> 'name'),
      site_id    = v_site,
      statuses   = coalesce(fp_jsonb_text_array(p -> 'statuses'), statuses),
      fields     = coalesce(fp_jsonb_text_array(p -> 'fields'), '{}'),
      priorities = fp_jsonb_text_array(p -> 'priorities'),
      layout     = coalesce(p ->> 'layout', layout),
      theme      = coalesce(p ->> 'theme', theme),
      lng        = coalesce(p ->> 'lng', lng),
      done_hours = coalesce((p ->> 'done_hours')::int, done_hours),
      active     = coalesce((p ->> 'active')::boolean, active),
      updated_at = now()
    where id = v_id
    returning * into r;
  end if;
  return r;
end;
$$;

-- A new secret link; the old one stops working at once.
create or replace function fp_rotate_display_board(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not exists (select 1 from fp_display_boards where id = p_id
                 and fp_has_role(org_id, array['org_admin', 'manager'])) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update fp_display_boards set token = replace(gen_random_uuid()::text, '-', ''), last_seen_at = null, updated_at = now()
   where id = p_id returning token into v_token;
  return v_token;
end;
$$;

create or replace function fp_delete_display_board(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from fp_display_boards where id = p_id
                 and fp_has_role(org_id, array['org_admin', 'manager'])) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  delete from fp_display_boards where id = p_id;
end;
$$;

-- ===========================================================================
-- The screen (anyone with the link)
-- ===========================================================================
create or replace function fp_display_board(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  b    fp_display_boards;
  o    fp_organizations;
  v_since timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into b from fp_display_boards where token = p_token;
  if b.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into o from fp_organizations where id = b.org_id;
  if not b.active or o.suspended_at is not null or o.deleted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'off', 'lng', b.lng, 'theme', b.theme);
  end if;

  -- "Online" in Settings; written at most once a minute per board.
  if b.last_seen_at is null or b.last_seen_at < now() - interval '1 minute' then
    update fp_display_boards set last_seen_at = now() where id = b.id;
  end if;

  v_since := now() - make_interval(hours => b.done_hours);

  return jsonb_build_object(
    'ok', true,
    'now', now(),
    'board', jsonb_build_object(
      'name', b.name, 'layout', b.layout, 'theme', b.theme, 'lng', b.lng, 'fields', to_jsonb(b.fields),
      'statuses', to_jsonb(b.statuses), 'done_hours', b.done_hours,
      'site', (select name_i18n from fp_sites where id = b.site_id)),
    'org', jsonb_build_object('name', o.name, 'logo_path', o.logo_path),
    'work_orders', coalesce((
      select jsonb_agg(w order by w.sort_group, w.prio_rank, w.due_at nulls last, w.created_at)
      from (
        select
          upper(left(wo.id::text, 6)) as ref,
          coalesce(nullif(btrim(wo.title), ''), (select r.title from fp_requests r where r.id = wo.request_id)) as title,
          wo.status,
          case when wo.status in ('resolved', 'verified', 'closed') then 2 when wo.status = 'on_hold' then 1 else 0 end as sort_group,
          wo.priority,
          array_position(array['critical', 'high', 'medium', 'low'], wo.priority) as prio_rank,
          wo.due_at,
          wo.due_at is not null and wo.due_at < now() and wo.status not in ('resolved', 'verified', 'closed') as overdue,
          wo.created_at,
          wo.updated_at,
          coalesce(wo.resolved_at, wo.closed_at, wo.updated_at) as done_at,
          case when 'location' = any(b.fields) then loc.name_i18n end as location,
          case when 'asset' = any(b.fields) then a.name_i18n end as asset,
          case when 'assignee' = any(b.fields) and wo.assigned_to is not null then
            split_part(btrim(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1))), ' ', 1)
          end as assignee
        from fp_work_orders wo
        left join fp_assets a on a.id = wo.asset_id
        left join fp_locations loc on loc.id = coalesce(wo.location_id, a.location_id)
        left join auth.users u on u.id = wo.assigned_to
        where wo.org_id = b.org_id
          and wo.status = any(b.statuses)
          and (b.site_id is null or loc.site_id = b.site_id)
          and (b.priorities is null or wo.priority = any(b.priorities))
          -- Finished work only for the last done_hours hours.
          and (wo.status not in ('resolved', 'verified', 'closed')
               or coalesce(wo.resolved_at, wo.closed_at, wo.updated_at) >= v_since)
        order by sort_group, prio_rank, wo.due_at nulls last, wo.created_at
        limit 200
      ) w), '[]'::jsonb)
  );
end;
$$;

revoke execute on function fp_jsonb_text_array(jsonb), fp_save_display_board(jsonb), fp_rotate_display_board(uuid), fp_delete_display_board(uuid),
  fp_display_board(text) from public, anon, authenticated;
grant execute on function fp_save_display_board(jsonb), fp_rotate_display_board(uuid), fp_delete_display_board(uuid)
  to authenticated;
grant execute on function fp_display_board(text) to anon, authenticated;
