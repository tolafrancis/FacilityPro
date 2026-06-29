-- 0016_notifications.sql
-- In-app notifications. (Email/push/SMS channels are a later phase.)

create table fp_notifications (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index fp_notifications_user_idx on fp_notifications (user_id, created_at desc);

alter table fp_notifications enable row level security;

-- Users see and update (mark read) only their own notifications.
-- Inserts come from SECURITY DEFINER triggers, which bypass RLS.
create policy notif_select on fp_notifications for select to authenticated
  using ( user_id = auth.uid() );
create policy notif_update on fp_notifications for update to authenticated
  using ( user_id = auth.uid() );

-- Notify the assignee when a work order is assigned (on insert or reassignment).
create or replace function fp_notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    insert into fp_notifications (org_id, user_id, kind, title, body, link)
    values (new.org_id, new.assigned_to, 'wo_assigned',
            'New work order assigned',
            coalesce(new.title, ''),
            '/work-orders/' || new.id);
  end if;
  return new;
end;
$$;

create trigger trg_fp_notify_assignment
  after insert or update on fp_work_orders
  for each row execute function fp_notify_assignment();

-- Notify admins/managers when a part drops to/below its reorder level.
create or replace function fp_notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  u record;
begin
  if new.stock_balance <= new.reorder_level
     and (old.stock_balance is distinct from new.stock_balance)
     and old.stock_balance > new.reorder_level then
    for u in
      select user_id from fp_users_orgs
      where org_id = new.org_id and role in ('org_admin','manager')
    loop
      insert into fp_notifications (org_id, user_id, kind, title, body, link)
      values (new.org_id, u.user_id, 'low_stock',
              'Low stock',
              coalesce(new.name_i18n->>'en', new.name_i18n->>'vi', ''),
              '/parts');
    end loop;
  end if;
  return new;
end;
$$;

create trigger trg_fp_notify_low_stock
  after update on fp_parts
  for each row execute function fp_notify_low_stock();
