-- 0087: support tickets (tenants ↔ FacilityPro support).
--
--   * Tenants open tickets from the app (Help & support). The requester sees
--     their own tickets, an org admin sees every ticket of the organisation.
--     Internal notes are never shown to tenants. A requester can reply
--     (which reopens the ticket), mark it solved and rate the answer.
--     At most 10 new tickets per person per day.
--   * Staff (tickets.view / tickets.manage) work an inbox: search, filters
--     (status, priority, assignee, SLA), bulk assign/status, replies and
--     internal notes, saved replies (macros), priority/category/tags,
--     tickets on a customer's behalf, and stats.
--   * Response targets (fp_ticket_sla, per priority, calendar time): first
--     response and resolution due dates are set when the ticket is created
--     (and when its priority changes). The clock is "paused" while the
--     ticket waits on the customer (pending) or is on hold.
--   * Notifications: a staff reply or solve notifies the requester (in-app,
--     plus email/SMS/push by their preferences; email for requesters without
--     an account). New tickets and customer replies appear in the admin
--     panel's notifications (fp_platform_events).
--   * Solved tickets close automatically after 7 days (job close_solved_tickets).
--   * Customer messages come from editable templates (support.ticket_reply,
--     support.ticket_solved; English and Vietnamese) via fp_render_template().
-- Covered by supabase/security-tests/support_tickets.sql.

-- ===========================================================================
-- Schema
-- ===========================================================================
alter table fp_support_tickets
  add column if not exists category              text not null default 'question',
  add column if not exists channel               text not null default 'app',
  add column if not exists first_response_due_at timestamptz,
  add column if not exists resolution_due_at     timestamptz,
  add column if not exists last_message_at       timestamptz,
  add column if not exists last_message_by       text,
  add column if not exists tags                  text[] not null default '{}',
  add column if not exists rating                text,
  add column if not exists rating_comment        text,
  add column if not exists closed_at             timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fp_support_tickets_category_check') then
    alter table fp_support_tickets
      add constraint fp_support_tickets_category_check check (category in ('question', 'problem', 'billing', 'account', 'feature', 'other')),
      add constraint fp_support_tickets_channel_check check (channel in ('app', 'admin', 'email')),
      add constraint fp_support_tickets_last_by_check check (last_message_by is null or last_message_by in ('staff', 'requester')),
      add constraint fp_support_tickets_rating_check check (rating is null or rating in ('good', 'bad'));
  end if;
end $$;
create index if not exists fp_support_tickets_assignee_idx on fp_support_tickets (assignee_id, status);
create index if not exists fp_support_tickets_requester_idx on fp_support_tickets (requester_id, created_at desc);

alter table fp_ticket_messages
  add column if not exists author_kind text not null default 'staff';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fp_ticket_messages_author_kind_check') then
    alter table fp_ticket_messages add constraint fp_ticket_messages_author_kind_check
      check (author_kind in ('staff', 'requester', 'system'));
  end if;
end $$;

-- Response targets per priority, in minutes of calendar time.
create table if not exists fp_ticket_sla (
  priority                text primary key check (priority in ('low', 'normal', 'high', 'urgent')),
  first_response_minutes  int not null check (first_response_minutes > 0),
  resolution_minutes      int not null check (resolution_minutes > 0)
);
insert into fp_ticket_sla (priority, first_response_minutes, resolution_minutes) values
  ('urgent', 60, 480), ('high', 240, 1440), ('normal', 480, 4320), ('low', 1440, 7200)
on conflict (priority) do nothing;

-- Saved replies.
create table if not exists fp_ticket_macros (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(btrim(title)) between 1 and 100),
  body       text not null check (length(body) between 1 and 5000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fp_ticket_sla enable row level security;
alter table fp_ticket_macros enable row level security;
drop policy if exists admin_read on fp_ticket_sla;
create policy admin_read on fp_ticket_sla for select to authenticated using ( fp_admin_can('tickets.view') );
drop policy if exists admin_write on fp_ticket_sla;
create policy admin_write on fp_ticket_sla for all to authenticated using ( fp_admin_can('platform.manage') ) with check ( fp_admin_can('platform.manage') );
drop policy if exists admin_read on fp_ticket_macros;
create policy admin_read on fp_ticket_macros for select to authenticated using ( fp_admin_can('tickets.view') );
drop policy if exists admin_write on fp_ticket_macros;
create policy admin_write on fp_ticket_macros for all to authenticated using ( fp_admin_can('tickets.manage') ) with check ( fp_admin_can('tickets.manage') );
drop trigger if exists trg_admin_audit on fp_ticket_sla;
create trigger trg_admin_audit after insert or update or delete on fp_ticket_sla for each row execute function fp_admin_audit_trigger();
drop trigger if exists trg_admin_audit on fp_ticket_macros;
create trigger trg_admin_audit after insert or update or delete on fp_ticket_macros for each row execute function fp_admin_audit_trigger();

-- Staff change tickets only through the functions below (SLA, notifications, audit).
drop policy if exists admin_write on fp_support_tickets;
drop policy if exists admin_write on fp_ticket_messages;
drop trigger if exists trg_admin_audit on fp_support_tickets;
drop trigger if exists trg_admin_audit on fp_ticket_messages;
revoke insert, update, delete on fp_support_tickets, fp_ticket_messages from anon, authenticated;

-- New ticket / customer reply show up in the admin notifications.
alter table fp_platform_events drop constraint if exists fp_platform_events_type_check;
alter table fp_platform_events add constraint fp_platform_events_type_check check (type in (
  'signup', 'upgrade', 'downgrade', 'cancellation', 'reactivation', 'trial_started', 'payment_failed',
  'payment_succeeded', 'suspended', 'unsuspended', 'deleted', 'ticket_created', 'ticket_reply'));

-- Existing tickets get due dates (before the lifecycle trigger exists, so
-- their "last updated" times stay as they are).
update fp_support_tickets t set first_response_due_at = t.created_at + make_interval(mins => s.first_response_minutes),
                                resolution_due_at = t.created_at + make_interval(mins => s.resolution_minutes),
                                sla_due_at = case when t.first_response_at is null
                                                  then t.created_at + make_interval(mins => s.first_response_minutes)
                                                  else t.created_at + make_interval(mins => s.resolution_minutes) end,
                                last_message_at = coalesce(t.last_message_at, t.updated_at)
  from fp_ticket_sla s where s.priority = t.priority and t.first_response_due_at is null;

-- ===========================================================================
-- Lifecycle: due dates, timestamps
-- ===========================================================================
create or replace function fp_ticket_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sla fp_ticket_sla;
begin
  if tg_op = 'INSERT' or new.priority is distinct from old.priority then
    select * into sla from fp_ticket_sla where priority = new.priority;
    new.first_response_due_at := new.created_at + make_interval(mins => coalesce(sla.first_response_minutes, 480));
    new.resolution_due_at := new.created_at + make_interval(mins => coalesce(sla.resolution_minutes, 4320));
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status = 'solved' and old.status <> 'solved' then new.solved_at := now(); end if;
    if new.status = 'closed' and old.status <> 'closed' then
      new.closed_at := now();
      new.solved_at := coalesce(new.solved_at, now());
    end if;
    if new.status in ('open', 'pending', 'on_hold') and old.status in ('solved', 'closed') then
      new.solved_at := null;
      new.closed_at := null;
    end if;
  end if;
  new.sla_due_at := case when new.first_response_at is null then new.first_response_due_at else new.resolution_due_at end;
  return new;
end;
$$;
drop trigger if exists trg_fp_ticket_lifecycle on fp_support_tickets;
create trigger trg_fp_ticket_lifecycle before insert or update on fp_support_tickets
  for each row execute function fp_ticket_lifecycle();

-- ok | due_soon | breached | paused | done
create or replace function fp_ticket_sla_state(p_status text, p_due timestamptz)
returns text
language sql
stable
as $$
  select case
    when p_status in ('solved', 'closed') then 'done'
    when p_status in ('pending', 'on_hold') then 'paused'
    when p_due is null then 'ok'
    when p_due < now() then 'breached'
    when p_due < now() + interval '2 hours' then 'due_soon'
    else 'ok'
  end;
$$;

-- Message templates (fp_message_templates, 0083; editable in the admin
-- panel): "{{name}}" placeholders filled from p_vars; English if the
-- language has no template; null if the key has none at all.
create or replace function fp_render_template(p_key text, p_lng text, p_vars jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r fp_message_templates;
  s text;
  b text;
  kv record;
begin
  select * into r from fp_message_templates where key = p_key and channel = 'email' and lng = p_lng;
  if r.key is null then
    select * into r from fp_message_templates where key = p_key and channel = 'email' and lng = 'en';
  end if;
  if r.key is null then
    return null;
  end if;
  s := coalesce(r.subject, '');
  b := r.body;
  for kv in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    s := replace(s, '{{' || kv.key || '}}', coalesce(kv.value, ''));
    b := replace(b, '{{' || kv.key || '}}', coalesce(kv.value, ''));
  end loop;
  return jsonb_build_object('subject', s, 'body', b);
end;
$$;

insert into fp_message_templates (key, channel, lng, subject, body, variables) values
  ('support.ticket_reply', 'email', 'en', 'Reply on ticket #{{number}}: {{subject}}',
   E'{{agent}} from FacilityPro Support replied:\n\n{{message}}\n\nReply in the app under Help & support.', array['number', 'subject', 'agent', 'message']),
  ('support.ticket_reply', 'email', 'vi', 'Phản hồi phiếu #{{number}}: {{subject}}',
   E'{{agent}} từ bộ phận hỗ trợ FacilityPro đã trả lời:\n\n{{message}}\n\nTrả lời trong ứng dụng tại mục Trợ giúp & hỗ trợ.', array['number', 'subject', 'agent', 'message']),
  ('support.ticket_solved', 'email', 'en', 'Ticket #{{number}} solved: {{subject}}',
   'Our support team marked your ticket as solved. Reply within 7 days if you still need help.', array['number', 'subject']),
  ('support.ticket_solved', 'email', 'vi', 'Phiếu #{{number}} đã được giải quyết: {{subject}}',
   'Bộ phận hỗ trợ đã đánh dấu phiếu của bạn là đã giải quyết. Hãy trả lời trong vòng 7 ngày nếu bạn vẫn cần trợ giúp.', array['number', 'subject'])
on conflict (key, channel, lng) do nothing;

-- Notifications that arrive with their own translations keep them.
create or replace function fp_notification_i18n()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.title_i18n := coalesce(new.title_i18n, jsonb_build_object('en', new.title, 'vi', fp_localize(new.title, 'vi')));
  new.body_i18n  := coalesce(new.body_i18n, case when new.body is null then null
                         else jsonb_build_object('en', new.body, 'vi', fp_localize(new.body, 'vi')) end);
  return new;
end;
$$;

-- Tells the requester about a staff reply or a solved ticket, from a
-- template: in-app (with email/SMS/push by their preferences) for members,
-- email in the organisation's language otherwise.
create or replace function fp_ticket_notify_requester(t fp_support_tickets, p_key text, p_vars jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  vars jsonb := jsonb_build_object('number', t.number, 'subject', t.subject) || coalesce(p_vars, '{}'::jsonb);
  en   jsonb := coalesce(fp_render_template(p_key, 'en', vars),
                         jsonb_build_object('subject', 'Update on ticket #' || t.number || ': ' || t.subject, 'body', coalesce(p_vars ->> 'message', '')));
  vi   jsonb := coalesce(fp_render_template(p_key, 'vi', vars), en);
  pick jsonb;
begin
  if t.requester_id is not null and t.org_id is not null
     and exists (select 1 from fp_users_orgs where user_id = t.requester_id and org_id = t.org_id) then
    insert into fp_notifications (org_id, user_id, kind, title, body, link, title_i18n, body_i18n)
    values (t.org_id, t.requester_id, 'support_ticket', en ->> 'subject', left(en ->> 'body', 1000), '/support/' || t.id,
            jsonb_build_object('en', en ->> 'subject', 'vi', vi ->> 'subject'),
            jsonb_build_object('en', left(en ->> 'body', 1000), 'vi', left(vi ->> 'body', 1000)));
  elsif t.requester_email is not null then
    pick := case when (select default_lng from fp_organizations where id = t.org_id) = 'vi' then vi else en end;
    insert into fp_notification_outbox (org_id, channel, to_address, subject, body)
    values (t.org_id, 'email', t.requester_email, pick ->> 'subject', left(pick ->> 'body', 4000));
  end if;
end;
$$;

-- Who may see a ticket from the tenant side.
create or replace function fp_ticket_visible(t fp_support_tickets)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select t.org_id is not null and fp_is_member(t.org_id)
         and (t.requester_id = auth.uid() or fp_has_role(t.org_id, array['org_admin']));
$$;

create or replace function fp_ticket_staff_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(nullif(pa.display_name, ''), split_part(nullif(u.raw_user_meta_data ->> 'full_name', ''), ' ', 1), 'FacilityPro Support')
  from auth.users u left join fp_platform_admins pa on pa.user_id = u.id where u.id = p_user;
$$;

-- ===========================================================================
-- Tenant side
-- ===========================================================================
create or replace function fp_create_ticket(p_org uuid, p_subject text, p_body text, p_category text default 'question', p_priority text default 'normal')
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id   uuid;
  v_subj text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null or not fp_is_member(p_org) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if length(v_subj) < 3 or length(v_subj) > 200 then
    raise exception 'subject_required' using errcode = '22023', detail = 'Give the ticket a subject (3–200 characters).';
  end if;
  if length(v_body) < 1 or length(v_body) > 20000 then
    raise exception 'body_required' using errcode = '22023', detail = 'Describe the problem.';
  end if;
  if p_category not in ('question', 'problem', 'billing', 'account', 'feature', 'other')
     or p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if (select count(*) from fp_support_tickets where requester_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_tickets' using errcode = '22023', detail = 'You can open up to 10 tickets a day. Add to an existing ticket instead.';
  end if;

  insert into fp_support_tickets (org_id, requester_id, requester_email, subject, category, priority, channel,
                                  last_message_at, last_message_by)
  values (p_org, auth.uid(), (select email from auth.users where id = auth.uid()), v_subj, p_category, p_priority, 'app',
          now(), 'requester')
  returning id into v_id;
  insert into fp_ticket_messages (ticket_id, author_id, body, author_kind) values (v_id, auth.uid(), v_body, 'requester');
  insert into fp_platform_events (type, org_id, detail)
  values ('ticket_created', p_org, jsonb_build_object('ticket', v_id, 'number', (select number from fp_support_tickets where id = v_id),
                                                       'subject', v_subj, 'priority', p_priority));
  return v_id;
end;
$$;

create or replace function fp_my_tickets(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fp_is_member(p_org) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id, 'number', t.number, 'subject', t.subject, 'status', t.status, 'priority', t.priority,
             'category', t.category, 'created_at', t.created_at, 'updated_at', t.updated_at,
             'last_message_at', t.last_message_at, 'last_message_by', t.last_message_by,
             'requester_email', t.requester_email, 'mine', t.requester_id = auth.uid())
           order by (t.status in ('solved', 'closed')), coalesce(t.last_message_at, t.created_at) desc)
    from fp_support_tickets t
    where t.org_id = p_org and fp_ticket_visible(t)), '[]'::jsonb);
end;
$$;

create or replace function fp_my_ticket(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  t fp_support_tickets;
begin
  select * into t from fp_support_tickets where id = p_id;
  if t.id is null or not fp_ticket_visible(t) then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', t.id, 'number', t.number, 'subject', t.subject, 'status', t.status, 'priority', t.priority,
    'category', t.category, 'created_at', t.created_at, 'solved_at', t.solved_at, 'closed_at', t.closed_at,
    'rating', t.rating, 'rating_comment', t.rating_comment, 'requester_email', t.requester_email,
    'can_reply', t.status <> 'closed' and not (t.status = 'solved' and t.solved_at < now() - interval '7 days'),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'body', m.body, 'created_at', m.created_at, 'author_kind', m.author_kind,
               'author', case when m.author_kind = 'staff' then fp_ticket_staff_name(m.author_id)
                              else coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email::text, t.requester_email) end,
               'mine', m.author_id = auth.uid())
             order by m.created_at)
      from fp_ticket_messages m left join auth.users u on u.id = m.author_id
      where m.ticket_id = t.id and not m.internal), '[]'::jsonb));
end;
$$;

create or replace function fp_ticket_reply(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t fp_support_tickets;
  v_body text := btrim(coalesce(p_body, ''));
begin
  select * into t from fp_support_tickets where id = p_id for update;
  if t.id is null or not fp_ticket_visible(t) then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if t.status = 'closed' or (t.status = 'solved' and t.solved_at < now() - interval '7 days') then
    raise exception 'ticket_closed' using errcode = '22023', detail = 'This ticket is closed. Open a new ticket instead.';
  end if;
  if length(v_body) < 1 or length(v_body) > 20000 then
    raise exception 'body_required' using errcode = '22023', detail = 'Write a message.';
  end if;
  insert into fp_ticket_messages (ticket_id, author_id, body, author_kind) values (p_id, auth.uid(), v_body, 'requester');
  update fp_support_tickets set status = 'open', last_message_at = now(), last_message_by = 'requester' where id = p_id;
  insert into fp_platform_events (type, org_id, detail)
  values ('ticket_reply', t.org_id, jsonb_build_object('ticket', t.id, 'number', t.number, 'subject', t.subject,
                                                        'assignee', t.assignee_id));
end;
$$;

create or replace function fp_ticket_mark_solved(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t fp_support_tickets;
begin
  select * into t from fp_support_tickets where id = p_id;
  if t.id is null or not fp_ticket_visible(t) then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if t.status in ('open', 'pending', 'on_hold') then
    update fp_support_tickets set status = 'solved' where id = p_id;
    insert into fp_ticket_messages (ticket_id, author_id, body, author_kind)
    values (p_id, auth.uid(), 'Marked as solved by the customer.', 'system');
  end if;
end;
$$;

create or replace function fp_ticket_rate(p_id uuid, p_rating text, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t fp_support_tickets;
begin
  select * into t from fp_support_tickets where id = p_id;
  if t.id is null or not fp_ticket_visible(t) then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if t.status not in ('solved', 'closed') then
    raise exception 'not_solved' using errcode = '22023', detail = 'You can rate a ticket once it is solved.';
  end if;
  if p_rating not in ('good', 'bad') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  update fp_support_tickets set rating = p_rating, rating_comment = left(nullif(btrim(coalesce(p_comment, '')), ''), 1000)
   where id = p_id;
end;
$$;

-- ===========================================================================
-- Staff side
-- ===========================================================================
create or replace function fp_admin_ticket_assignable(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from fp_platform_admins
                 where user_id = p_user and disabled_at is null
                   and 'tickets.manage' = any(fp_admin_role_permissions(role)));
$$;

create or replace function fp_admin_tickets(
  p_search   text default null,
  p_status   text default null,   -- open | pending | on_hold | solved | closed | active (open+pending+on_hold) | null (all)
  p_priority text default null,
  p_assignee text default null,   -- me | none | <uuid>
  p_sla      text default null,   -- breached | due_soon
  p_org      uuid default null,
  p_sort     text default 'sla',
  p_desc     boolean default false,
  p_limit    int default 25,
  p_offset   int default 0,
  p_ids      uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 25), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_sort   text := case when p_sort in ('sla', 'number', 'updated', 'created', 'priority', 'status', 'subject') then p_sort else 'sla' end;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  result   jsonb;
begin
  perform fp_admin_require('tickets.view');
  with base as (
    select t.id, t.number, t.subject, t.status, t.priority, t.category, t.channel, t.org_id, o.name as org_name,
           t.requester_id, t.requester_email, t.assignee_id, (select email::text from auth.users where id = t.assignee_id) as assignee_email,
           t.created_at, t.updated_at, t.last_message_at, t.last_message_by, t.first_response_at,
           t.sla_due_at, fp_ticket_sla_state(t.status, t.sla_due_at) as sla_state, t.tags, t.rating,
           (select count(*) from fp_ticket_messages m where m.ticket_id = t.id and not m.internal) as messages
    from fp_support_tickets t left join fp_organizations o on o.id = t.org_id
    where (p_ids is null or t.id = any(p_ids))
      and (v_search is null or t.subject ilike '%' || v_search || '%' or o.name ilike '%' || v_search || '%'
           or t.requester_email ilike '%' || v_search || '%' or t.number::text = ltrim(v_search, '#')
           or v_search = any(t.tags))
      and (p_status is null or (p_status = 'active' and t.status in ('open', 'pending', 'on_hold')) or t.status = p_status)
      and (p_priority is null or t.priority = p_priority)
      and (p_assignee is null or (p_assignee = 'me' and t.assignee_id = auth.uid())
           or (p_assignee = 'none' and t.assignee_id is null) or t.assignee_id::text = p_assignee)
      and (p_org is null or t.org_id = p_org)
  ),
  filtered as (select * from base where p_sla is null or sla_state = p_sla),
  page as (
    select * from filtered
    order by
      case when not p_desc then case v_sort when 'status' then status when 'subject' then lower(subject) end end asc nulls last,
      case when p_desc then case v_sort when 'status' then status when 'subject' then lower(subject) end end desc nulls last,
      case when not p_desc then case v_sort
        when 'sla' then case when sla_state in ('breached', 'due_soon', 'ok') then extract(epoch from sla_due_at) end
        when 'number' then number when 'updated' then extract(epoch from coalesce(last_message_at, updated_at))
        when 'created' then extract(epoch from created_at)
        when 'priority' then array_position(array['urgent', 'high', 'normal', 'low'], priority) end end asc nulls last,
      case when p_desc then case v_sort
        when 'sla' then case when sla_state in ('breached', 'due_soon', 'ok') then extract(epoch from sla_due_at) end
        when 'number' then number when 'updated' then extract(epoch from coalesce(last_message_at, updated_at))
        when 'created' then extract(epoch from created_at)
        when 'priority' then array_position(array['urgent', 'high', 'normal', 'low'], priority) end end desc nulls last,
      created_at desc
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function fp_admin_ticket(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  t fp_support_tickets;
begin
  perform fp_admin_require('tickets.view');
  select * into t from fp_support_tickets where id = p_id;
  if t.id is null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  return to_jsonb(t) || jsonb_build_object(
    'sla_state', fp_ticket_sla_state(t.status, t.sla_due_at),
    'first_response_state', case when t.first_response_at is not null then
                               case when t.first_response_at <= t.first_response_due_at then 'met' else 'missed' end
                             else fp_ticket_sla_state(t.status, t.first_response_due_at) end,
    'assignee_email', (select email::text from auth.users where id = t.assignee_id),
    'requester', (select jsonb_build_object('id', u.id, 'email', u.email, 'name', nullif(u.raw_user_meta_data ->> 'full_name', ''),
                                            'role', (select role from fp_users_orgs where user_id = u.id and org_id = t.org_id))
                  from auth.users u where u.id = t.requester_id),
    'org', (select jsonb_build_object('id', o.id, 'name', o.name, 'plan', s.plan_code,
                                      'status', fp_admin_tenant_status(o.suspended_at, o.deleted_at, s.status))
            from fp_organizations o left join fp_subscriptions s on s.org_id = o.id where o.id = t.org_id),
    'other_tickets', (select count(*) from fp_support_tickets x where x.org_id = t.org_id and x.id <> t.id),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'body', m.body, 'internal', m.internal, 'author_kind', m.author_kind, 'created_at', m.created_at,
               'author_email', u.email, 'author_name', coalesce(nullif(pa.display_name, ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email::text))
             order by m.created_at)
      from fp_ticket_messages m left join auth.users u on u.id = m.author_id
      left join fp_platform_admins pa on pa.user_id = m.author_id
      where m.ticket_id = t.id), '[]'::jsonb));
end;
$$;

-- Applies a change: status, priority, category, assignee (uuid or null), tags.
create or replace function fp_admin_ticket_apply(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t fp_support_tickets;
  v_assignee uuid;
begin
  select * into t from fp_support_tickets where id = p_id for update;
  if t.id is null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if p ? 'status' and p ->> 'status' not in ('open', 'pending', 'on_hold', 'solved', 'closed') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if p ? 'priority' and p ->> 'priority' not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if p ? 'category' and p ->> 'category' not in ('question', 'problem', 'billing', 'account', 'feature', 'other') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if p ? 'assignee_id' then
    v_assignee := nullif(p ->> 'assignee_id', '')::uuid;
    if v_assignee is not null and not fp_admin_ticket_assignable(v_assignee) then
      raise exception 'invalid_assignee' using errcode = '22023', detail = 'Assign tickets to support staff only.';
    end if;
  end if;
  update fp_support_tickets set
    status = coalesce(p ->> 'status', status),
    priority = coalesce(p ->> 'priority', priority),
    category = coalesce(p ->> 'category', category),
    assignee_id = case when p ? 'assignee_id' then v_assignee else assignee_id end,
    tags = case when p ? 'tags' then (select coalesce(array_agg(distinct lower(btrim(x))) filter (where btrim(x) <> ''), '{}')
                                      from jsonb_array_elements_text(p -> 'tags') x) else tags end
  where id = p_id;
  perform fp_admin_log('ticket.update', 'fp_support_tickets', p_id::text, t.org_id,
                       jsonb_build_object('status', t.status, 'priority', t.priority, 'assignee_id', t.assignee_id, 'category', t.category),
                       p);
  if p ->> 'status' = 'solved' and t.status <> 'solved' then
    perform fp_ticket_notify_requester(t, 'support.ticket_solved', null);
  end if;
end;
$$;

create or replace function fp_admin_ticket_update(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('tickets.manage');
  perform fp_admin_ticket_apply(p_id, p);
end;
$$;

create or replace function fp_admin_tickets_bulk(p_ids uuid[], p jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid;
  n int := 0;
begin
  perform fp_admin_require('tickets.manage');
  if coalesce(array_length(p_ids, 1), 0) > 200 then
    raise exception 'too_many' using errcode = '22023', detail = 'Change up to 200 tickets at a time.';
  end if;
  foreach v in array coalesce(p_ids, '{}') loop
    perform fp_admin_ticket_apply(v, p);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- A reply to the customer (notifies them) or an internal note.
create or replace function fp_admin_ticket_reply(p_id uuid, p_body text, p_internal boolean default false, p_status text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t fp_support_tickets;
  v_body text := btrim(coalesce(p_body, ''));
  v_msg uuid;
begin
  perform fp_admin_require('tickets.manage');
  select * into t from fp_support_tickets where id = p_id for update;
  if t.id is null then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if length(v_body) < 1 or length(v_body) > 20000 then
    raise exception 'body_required' using errcode = '22023', detail = 'Write a message.';
  end if;
  if p_status is not null and p_status not in ('open', 'pending', 'on_hold', 'solved', 'closed') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  insert into fp_ticket_messages (ticket_id, author_id, body, internal, author_kind)
  values (p_id, auth.uid(), v_body, coalesce(p_internal, false), 'staff') returning id into v_msg;

  if coalesce(p_internal, false) then
    if p_status is not null then
      update fp_support_tickets set status = p_status where id = p_id;
    else
      update fp_support_tickets set updated_at = now() where id = p_id;
    end if;
  else
    -- A public reply: the first one stops the first-response clock; the
    -- ticket then waits on the customer unless another status is chosen.
    update fp_support_tickets
       set first_response_at = coalesce(first_response_at, now()),
           assignee_id = coalesce(assignee_id, case when fp_admin_ticket_assignable(auth.uid()) then auth.uid() end),
           status = coalesce(p_status, 'pending'),
           last_message_at = now(), last_message_by = 'staff'
     where id = p_id;
    perform fp_ticket_notify_requester(t, 'support.ticket_reply',
      jsonb_build_object('message', v_body, 'agent', fp_ticket_staff_name(auth.uid())));
  end if;
  perform fp_admin_log(case when coalesce(p_internal, false) then 'ticket.note' else 'ticket.reply' end,
                       'fp_support_tickets', p_id::text, t.org_id, null,
                       jsonb_build_object('message', v_msg, 'status', p_status));
  return v_msg;
end;
$$;

-- A ticket opened by staff for a customer (phone call, email).
create or replace function fp_admin_create_ticket(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org   uuid := nullif(p ->> 'org_id', '')::uuid;
  v_email text := lower(btrim(coalesce(p ->> 'requester_email', '')));
  v_user  uuid;
  v_subj  text := btrim(coalesce(p ->> 'subject', ''));
  v_body  text := btrim(coalesce(p ->> 'body', ''));
  v_id    uuid;
begin
  perform fp_admin_require('tickets.manage');
  if v_org is not null and not exists (select 1 from fp_organizations where id = v_org) then
    raise exception 'unknown_org' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023', detail = 'Enter the customer''s email address.';
  end if;
  if length(v_subj) < 3 or length(v_subj) > 200 or length(v_body) < 1 or length(v_body) > 20000 then
    raise exception 'subject_required' using errcode = '22023', detail = 'Give a subject (3–200 characters) and a description.';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  insert into fp_support_tickets (org_id, requester_id, requester_email, subject, category, priority, channel,
                                  last_message_at, last_message_by)
  values (v_org, v_user, v_email, v_subj, coalesce(nullif(p ->> 'category', ''), 'question'),
          coalesce(nullif(p ->> 'priority', ''), 'normal'), 'admin', now(), 'requester')
  returning id into v_id;
  insert into fp_ticket_messages (ticket_id, author_id, body, author_kind) values (v_id, auth.uid(), v_body, 'requester');
  perform fp_admin_log('ticket.create', 'fp_support_tickets', v_id::text, v_org, null, jsonb_build_object('subject', v_subj, 'email', v_email));
  return v_id;
end;
$$;

create or replace function fp_admin_ticket_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('tickets.view');
  return (
    with active as (select *, fp_ticket_sla_state(status, sla_due_at) as st from fp_support_tickets where status in ('open', 'pending', 'on_hold'))
    select jsonb_build_object(
      'open', (select count(*) from active where status = 'open'),
      'pending', (select count(*) from active where status = 'pending'),
      'on_hold', (select count(*) from active where status = 'on_hold'),
      'unassigned', (select count(*) from active where assignee_id is null),
      'mine', (select count(*) from active where assignee_id = auth.uid()),
      'breached', (select count(*) from active where st = 'breached'),
      'due_soon', (select count(*) from active where st = 'due_soon'),
      'solved_7d', (select count(*) from fp_support_tickets where solved_at > now() - interval '7 days'),
      'first_response_hours_30d', (select round(avg(extract(epoch from first_response_at - created_at)) / 3600, 1)
                                   from fp_support_tickets where created_at > now() - interval '30 days' and first_response_at is not null),
      'first_response_met_pct_30d', (select round(100.0 * count(*) filter (where first_response_at <= first_response_due_at) / nullif(count(*), 0))
                                     from fp_support_tickets where created_at > now() - interval '30 days' and first_response_at is not null),
      'satisfaction_pct_30d', (select round(100.0 * count(*) filter (where rating = 'good') / nullif(count(*), 0))
                               from fp_support_tickets where rating is not null and coalesce(solved_at, updated_at) > now() - interval '30 days'),
      'ratings_30d', (select count(*) from fp_support_tickets where rating is not null and coalesce(solved_at, updated_at) > now() - interval '30 days')
    ));
end;
$$;

-- Staff who can take tickets (for the assignee picker).
create or replace function fp_admin_ticket_agents()
returns table (user_id uuid, email text, name text, role text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform fp_admin_require('tickets.view');
  return query
    select pa.user_id, u.email::text, coalesce(nullif(pa.display_name, ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email::text), pa.role
    from fp_platform_admins pa join auth.users u on u.id = pa.user_id
    where pa.disabled_at is null and 'tickets.manage' = any(fp_admin_role_permissions(pa.role))
    order by 3;
end;
$$;

-- ===========================================================================
-- Job: solved tickets close after 7 days
-- ===========================================================================
create or replace function fp_close_solved_tickets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform fp_assert_scheduler_or_manager(null);
  update fp_support_tickets set status = 'closed' where status = 'solved' and solved_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

insert into fp_jobs (job, description, max_silence, run_sql) values
  ('close_solved_tickets', 'Close support tickets solved more than 7 days ago', interval '26 hours', 'select fp_close_solved_tickets()')
on conflict (job) do update set description = excluded.description, max_silence = excluded.max_silence, run_sql = excluded.run_sql;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fp-close-solved-tickets', '40 * * * *', $job$select fp_run_job('close_solved_tickets')$job$);
  else
    raise warning '0087: pg_cron is not enabled, so closing solved tickets was NOT scheduled.';
  end if;
end $$;


-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on function fp_ticket_lifecycle(), fp_ticket_sla_state(text, timestamptz),
  fp_ticket_notify_requester(fp_support_tickets, text, jsonb), fp_render_template(text, text, jsonb), fp_ticket_visible(fp_support_tickets), fp_ticket_staff_name(uuid),
  fp_create_ticket(uuid, text, text, text, text), fp_my_tickets(uuid), fp_my_ticket(uuid), fp_ticket_reply(uuid, text),
  fp_ticket_mark_solved(uuid), fp_ticket_rate(uuid, text, text), fp_admin_ticket_assignable(uuid),
  fp_admin_tickets(text, text, text, text, text, uuid, text, boolean, int, int, uuid[]), fp_admin_ticket(uuid),
  fp_admin_ticket_apply(uuid, jsonb), fp_admin_ticket_update(uuid, jsonb), fp_admin_tickets_bulk(uuid[], jsonb),
  fp_admin_ticket_reply(uuid, text, boolean, text), fp_admin_create_ticket(jsonb), fp_admin_ticket_stats(),
  fp_admin_ticket_agents(), fp_close_solved_tickets() from public, anon, authenticated;

grant execute on function fp_create_ticket(uuid, text, text, text, text), fp_my_tickets(uuid), fp_my_ticket(uuid),
  fp_ticket_reply(uuid, text), fp_ticket_mark_solved(uuid), fp_ticket_rate(uuid, text, text),
  fp_admin_tickets(text, text, text, text, text, uuid, text, boolean, int, int, uuid[]), fp_admin_ticket(uuid),
  fp_admin_ticket_update(uuid, jsonb), fp_admin_tickets_bulk(uuid[], jsonb), fp_admin_ticket_reply(uuid, text, boolean, text),
  fp_admin_create_ticket(jsonb), fp_admin_ticket_stats(), fp_admin_ticket_agents() to authenticated;
grant execute on function fp_close_solved_tickets() to service_role;
