-- 0020_push.sql
-- Web push as a third notification channel. Subscriptions are stored per user;
-- the process-outbox Edge Function delivers push rows via VAPID/web-push.

alter table fp_notification_prefs add column push_enabled boolean not null default false;

create table fp_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index fp_push_subs_user_idx on fp_push_subscriptions (user_id);

alter table fp_push_subscriptions enable row level security;
create policy push_select on fp_push_subscriptions for select to authenticated
  using ( user_id = auth.uid() );
create policy push_insert on fp_push_subscriptions for insert to authenticated
  with check ( user_id = auth.uid() );
create policy push_delete on fp_push_subscriptions for delete to authenticated
  using ( user_id = auth.uid() );

-- Extend the fan-out to enqueue a push row when the user has opted in.
-- (A push outbox row carries the user_id in to_address; the Edge Function
--  expands it to that user's stored subscriptions.)
create or replace function fp_enqueue_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  addr text;
begin
  select email_enabled, sms_enabled, push_enabled, phone
    into p
    from fp_notification_prefs
    where user_id = new.user_id;

  if p is null then
    return new;
  end if;

  if coalesce(p.email_enabled, false) then
    select email into addr from auth.users where id = new.user_id;
    if addr is not null then
      insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
      values (new.user_id, 'email', addr, new.title, new.body);
    end if;
  end if;

  if coalesce(p.sms_enabled, false) and p.phone is not null and length(p.phone) > 0 then
    insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
    values (new.user_id, 'sms', p.phone, new.title,
            new.title || coalesce(' — ' || nullif(new.body, ''), ''));
  end if;

  if coalesce(p.push_enabled, false) then
    insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
    values (new.user_id, 'push', new.user_id::text, new.title, new.body);
  end if;

  return new;
end;
$$;
