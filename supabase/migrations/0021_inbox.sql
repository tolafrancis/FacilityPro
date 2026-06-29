-- 0021_inbox.sql
-- Unified inbox: conversations with an external contact across channels
-- (web, whatsapp, zalo, line, email, manual) and their messages.

create table fp_conversations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references fp_organizations(id) on delete cascade,
  channel         text not null default 'manual'
                    check (channel in ('manual','web','whatsapp','zalo','line','email')),
  contact_name    text,
  contact_handle  text,
  status          text not null default 'open' check (status in ('open','closed')),
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table fp_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references fp_organizations(id) on delete cascade,
  conversation_id uuid not null references fp_conversations(id) on delete cascade,
  direction       text not null check (direction in ('in','out')),
  body            text not null,
  sender          uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index fp_conversations_org_idx on fp_conversations (org_id, last_message_at desc);
create index fp_messages_conv_idx      on fp_messages (conversation_id, created_at);

alter table fp_conversations enable row level security;
alter table fp_messages      enable row level security;

create policy conv_select on fp_conversations for select to authenticated
  using ( fp_is_member(org_id) );
create policy conv_write on fp_conversations for all to authenticated
  using ( fp_is_member(org_id) )
  with check ( fp_is_member(org_id) );

create policy msg_select on fp_messages for select to authenticated
  using ( fp_is_member(org_id) );
create policy msg_write on fp_messages for all to authenticated
  using ( fp_is_member(org_id) )
  with check ( fp_is_member(org_id) );

-- Keep conversation.last_message_at fresh and notify managers on inbound.
create or replace function fp_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  u record;
  cname text;
begin
  update fp_conversations
    set last_message_at = new.created_at,
        status = 'open'
    where id = new.conversation_id;

  if new.direction = 'in' then
    select contact_name into cname from fp_conversations where id = new.conversation_id;
    for u in
      select user_id from fp_users_orgs
      where org_id = new.org_id and role in ('org_admin','manager')
    loop
      insert into fp_notifications (org_id, user_id, kind, title, body, link)
      values (new.org_id, u.user_id, 'inbox_message',
              'New message' || coalesce(' from ' || cname, ''),
              left(new.body, 140), '/inbox');
    end loop;
  end if;

  return new;
end;
$$;

create trigger trg_fp_on_message
  after insert on fp_messages
  for each row execute function fp_on_message();
