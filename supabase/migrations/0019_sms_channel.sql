-- 0019_sms_channel.sql
-- Adds an SMS channel alongside email. Both flow through fp_notification_outbox
-- and are delivered by the process-outbox Edge Function (Twilio for SMS).

alter table fp_notification_prefs add column sms_enabled boolean not null default false;
alter table fp_notification_prefs add column phone text;

-- Replace the email-only enqueuer with one that fans out to every channel the
-- recipient has opted into.
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
  select email_enabled, sms_enabled, phone
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

  return new;
end;
$$;

drop trigger if exists trg_fp_enqueue_email on fp_notifications;
create trigger trg_fp_enqueue_channels
  after insert on fp_notifications
  for each row execute function fp_enqueue_channels();
