-- 0012_parts_inventory.sql
-- Parts catalogue, stock balances, and consumption against work orders.

create table fp_parts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references fp_organizations(id) on delete cascade,
  name_i18n     jsonb not null,
  sku           text,
  unit          text,
  stock_balance numeric not null default 0,
  reorder_level numeric not null default 0,
  unit_cost     numeric(14,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table fp_wo_parts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references fp_organizations(id) on delete cascade,
  work_order_id uuid not null references fp_work_orders(id) on delete cascade,
  part_id       uuid not null references fp_parts(id) on delete restrict,
  quantity      numeric not null check (quantity > 0),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index fp_parts_org_idx     on fp_parts (org_id);
create index fp_wo_parts_wo_idx    on fp_wo_parts (work_order_id);

create trigger trg_fp_parts_touch
  before update on fp_parts
  for each row execute function fp_touch_updated_at();

-- Consuming a part on a work order decrements stock.
create or replace function fp_consume_part()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update fp_parts
    set stock_balance = stock_balance - new.quantity
    where id = new.part_id;
  return new;
end;
$$;

create trigger trg_fp_consume_part
  after insert on fp_wo_parts
  for each row execute function fp_consume_part();

-- RLS
alter table fp_parts    enable row level security;
alter table fp_wo_parts enable row level security;

create policy parts_select on fp_parts for select to authenticated
  using ( fp_is_member(org_id) );
create policy parts_write on fp_parts for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create policy wop_select on fp_wo_parts for select to authenticated
  using ( fp_is_member(org_id) );
create policy wop_insert on fp_wo_parts for insert to authenticated
  with check ( fp_is_member(org_id) );
create policy wop_delete on fp_wo_parts for delete to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) or created_by = auth.uid() );

create trigger trg_audit_parts after insert or update or delete
  on fp_parts for each row execute function fp_audit();
