-- 0018_approvals.sql
-- Approval workflow for work orders: request -> approve/reject, with
-- notifications to managers (on request) and to the requester (on decision).

create table fp_approvals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references fp_organizations(id) on delete cascade,
  work_order_id uuid not null references fp_work_orders(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  note          text,
  requested_by  uuid references auth.users(id) on delete set null,
  decided_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);

create index fp_approvals_org_status_idx on fp_approvals (org_id, status);
create index fp_approvals_wo_idx         on fp_approvals (work_order_id);

alter table fp_approvals enable row level security;

create policy appr_select on fp_approvals for select to authenticated
  using ( fp_is_member(org_id) );
create policy appr_insert on fp_approvals for insert to authenticated
  with check ( fp_is_member(org_id) and requested_by = auth.uid() );
create policy appr_update on fp_approvals for update to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );

create trigger trg_audit_approvals after insert or update or delete
  on fp_approvals for each row execute function fp_audit();

-- Notify managers when an approval is requested.
create or replace function fp_notify_approval_requested()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  u record;
  wo_title text;
begin
  select title into wo_title from fp_work_orders where id = new.work_order_id;
  for u in
    select user_id from fp_users_orgs
    where org_id = new.org_id and role in ('org_admin','manager')
  loop
    insert into fp_notifications (org_id, user_id, kind, title, body, link)
    values (new.org_id, u.user_id, 'approval_requested',
            'Approval requested', coalesce(wo_title, ''), '/approvals');
  end loop;
  return new;
end;
$$;

create trigger trg_fp_notify_approval_requested
  after insert on fp_approvals
  for each row execute function fp_notify_approval_requested();

-- Notify the requester when a decision is made.
create or replace function fp_notify_approval_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected')
     and new.requested_by is not null then
    insert into fp_notifications (org_id, user_id, kind, title, body, link)
    values (new.org_id, new.requested_by, 'approval_' || new.status,
            case when new.status = 'approved' then 'Approval granted'
                 else 'Approval rejected' end,
            coalesce(new.note, ''),
            '/work-orders/' || new.work_order_id);
  end if;
  return new;
end;
$$;

create trigger trg_fp_notify_approval_decided
  after update on fp_approvals
  for each row execute function fp_notify_approval_decided();
