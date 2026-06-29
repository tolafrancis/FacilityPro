-- 0017_notification_channels.sql
-- Email notification channel layered on top of in-app notifications.
-- Every in-app notification can spawn an outbox row when the recipient has
-- opted in. A deployable Edge Function (supabase/functions/process-outbox)
-- delivers the queued emails. SMS/push are future channels reusing the outbox.

create table fp_notification_prefs (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default false,
  updated_at    timestamptz not null default now()
);

create table fp_notification_outbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  channel     text not null default 'email',
  to_address  text not null,
  subject     text not null,
  body        text,
  status      text not null default 'pending'
                check (status in ('pending','sent','failed')),
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create index fp_outbox_status_idx on fp_notification_outbox (status, created_at);

create trigger trg_fp_prefs_touch
  before update on fp_notification_prefs
  for each row execute function fp_touch_updated_at();

-- Enqueue an email when a new in-app notification lands and the user opted in.
create or replace function fp_enqueue_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pref_on boolean;
  addr text;
begin
  select email_enabled into pref_on from fp_notification_prefs where user_id = new.user_id;
  if coalesce(pref_on, false) then
    select email into addr from auth.users where id = new.user_id;
    if addr is not null then
      insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
      values (new.user_id, 'email', addr, new.title, new.body);
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_fp_enqueue_email
  after insert on fp_notifications
  for each row execute function fp_enqueue_email();

-- RLS
alter table fp_notification_prefs  enable row level security;
alter table fp_notification_outbox enable row level security;

-- Users manage only their own preferences.
create policy prefs_select on fp_notification_prefs for select to authenticated
  using ( user_id = auth.uid() );
create policy prefs_upsert on fp_notification_prefs for insert to authenticated
  with check ( user_id = auth.uid() );
create policy prefs_update on fp_notification_prefs for update to authenticated
  using ( user_id = auth.uid() );

-- The outbox has no authenticated policies: it is read/written only by the
-- SECURITY DEFINER trigger above and by the Edge Function (service role).
