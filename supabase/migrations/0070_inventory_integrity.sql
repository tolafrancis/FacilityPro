-- 0070_inventory_integrity.sql
-- Audit findings S1-M3 (inventory) and S3-M1 (deletes that erase history).
-- Covered by supabase/security-tests/inventory.sql.
--
--   * Stock can't go below zero unless the organisation allows it
--     (settings.allow_negative_stock). The check happens where the balance
--     changes, under the part's row lock, so concurrent issues can't
--     overdraw it together.
--   * Removing a part line from a work order posts a 'return' to the ledger
--     (stock goes back up).
--   * Every stock change is in the ledger: a new part's starting stock is an
--     opening 'receipt', and a direct edit of stock_balance is recorded as
--     an 'adjustment'. Ledger rows record who made them.
--   * Parts and labour can't be added to, changed on or removed from a
--     verified or closed work order.
--   * A technician's labour line uses their rate from the technician profile;
--     only admins/managers can set a different rate, or log time for others.
--   * The ledger is no longer deleted with its part (history is kept);
--     fault and asset types are deactivated instead of deleted in the app.

alter table fp_inventory_transactions drop constraint if exists fp_inventory_transactions_type_check;
alter table fp_inventory_transactions add constraint fp_inventory_transactions_type_check
  check (type in ('issue', 'receipt', 'adjustment', 'cycle_count', 'return'));
alter table fp_inventory_transactions alter column created_by set default auth.uid();
-- Rows recording a change already made to stock_balance (opening balance,
-- direct edit): the ledger trigger must not apply them a second time.
alter table fp_inventory_transactions add column if not exists pre_applied boolean not null default false;

-- ---------------------------------------------------------------------------
-- Ledger keeps its history
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'fp_inventory_transactions'::regclass and contype = 'f'
      and confrelid = 'fp_parts'::regclass
  loop
    execute format('alter table fp_inventory_transactions drop constraint %I', c.conname);
  end loop;
end $$;
-- NO ACTION (not RESTRICT): deleting a whole organisation still removes
-- both in one statement.
alter table fp_inventory_transactions
  add constraint fp_inv_tx_part_org_fk foreign key (part_id, org_id) references fp_parts (id, org_id);

-- ---------------------------------------------------------------------------
-- Balance changes
-- ---------------------------------------------------------------------------
create or replace function fp_apply_inventory_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_allow   boolean;
begin
  if new.pre_applied then
    return new;
  end if;
  update fp_parts set stock_balance = stock_balance + new.quantity_delta
    where id = new.part_id
    returning stock_balance into v_balance;
  if new.quantity_delta < 0 and v_balance < 0 then
    select coalesce((settings ->> 'allow_negative_stock')::boolean, false) into v_allow
      from fp_organizations where id = new.org_id;
    if not v_allow then
      raise exception 'Not enough stock: only % left.', v_balance - new.quantity_delta
        using errcode = 'P0001', hint = 'insufficient_stock';
    end if;
  end if;
  return new;
end;
$$;

-- A part's starting stock becomes an opening receipt.
create or replace function fp_part_opening_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock_balance <> 0 then
    insert into fp_inventory_transactions (org_id, part_id, type, quantity_delta, note, pre_applied)
    values (new.org_id, new.id, 'receipt', new.stock_balance, 'Opening balance', true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_part_opening_balance on fp_parts;
create trigger trg_fp_part_opening_balance
  after insert on fp_parts
  for each row execute function fp_part_opening_balance();

-- Editing stock_balance directly (not via the ledger) is recorded.
create or replace function fp_part_direct_adjustment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Depth 1 = a direct UPDATE; deeper = the ledger trigger applying a row.
  if pg_trigger_depth() = 1 then
    insert into fp_inventory_transactions (org_id, part_id, type, quantity_delta, note, pre_applied)
    values (new.org_id, new.id, 'adjustment', new.stock_balance - old.stock_balance, 'Direct edit of stock balance', true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_part_direct_adjustment on fp_parts;
create trigger trg_fp_part_direct_adjustment
  after update of stock_balance on fp_parts
  for each row when (old.stock_balance is distinct from new.stock_balance)
  execute function fp_part_direct_adjustment();

-- Removing a part line returns the stock.
create or replace function fp_return_part()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Organisation or part being deleted: nothing to return to.
  if not exists (select 1 from fp_parts where id = old.part_id) then
    return old;
  end if;
  insert into fp_inventory_transactions (org_id, part_id, type, quantity_delta, ref_table, ref_id, note)
  values (old.org_id, old.part_id, 'return', old.quantity, 'fp_wo_parts', old.id, 'Removed from work order');
  return old;
end;
$$;

drop trigger if exists trg_fp_return_part on fp_wo_parts;
create trigger trg_fp_return_part
  after delete on fp_wo_parts
  for each row execute function fp_return_part();

-- ---------------------------------------------------------------------------
-- Finished work orders are locked
-- ---------------------------------------------------------------------------
create or replace function fp_wo_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from fp_work_orders
    where id = coalesce(new.work_order_id, old.work_order_id);
  -- Missing work order = cascade from deleting it.
  if v_status in ('verified', 'closed') then
    raise exception 'This work order is % — parts and labour can no longer be changed.', v_status
      using errcode = 'P0001', hint = 'work_order_locked';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_fp_wo_parts_guard on fp_wo_parts;
create trigger trg_fp_wo_parts_guard
  before insert or update or delete on fp_wo_parts
  for each row execute function fp_wo_lines_guard();
drop trigger if exists trg_fp_wo_labor_guard on fp_wo_labor;
create trigger trg_fp_wo_labor_guard
  before insert or update or delete on fp_wo_labor
  for each row execute function fp_wo_lines_guard();

-- ---------------------------------------------------------------------------
-- Labour rate from the technician profile
-- ---------------------------------------------------------------------------
alter table fp_wo_labor alter column user_id set default auth.uid();

create or replace function fp_wo_labor_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins/managers (and server-side jobs) may set any rate and log for
  -- anyone; everyone else logs their own time at their profile rate.
  if auth.uid() is null or fp_has_role(new.org_id, array['org_admin', 'manager']) then
    if tg_op = 'INSERT' and new.rate_snapshot = 0 then
      select coalesce(labor_rate, 0) into new.rate_snapshot
        from fp_technician_profiles where org_id = new.org_id and user_id = new.user_id;
      new.rate_snapshot := coalesce(new.rate_snapshot, 0);
    end if;
    return new;
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'You can only log your own time.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.rate_snapshot := old.rate_snapshot;
  else
    select coalesce(labor_rate, 0) into new.rate_snapshot
      from fp_technician_profiles where org_id = new.org_id and user_id = new.user_id;
    new.rate_snapshot := coalesce(new.rate_snapshot, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_wo_labor_rate on fp_wo_labor;
create trigger trg_fp_wo_labor_rate
  before insert or update on fp_wo_labor
  for each row execute function fp_wo_labor_rate();

-- ---------------------------------------------------------------------------
-- Existing negative balances (allowed before this migration)
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from fp_parts where stock_balance < 0;
  if n > 0 then
    raise warning '0070: % part(s) already have negative stock. Further issues of them are refused until stock is received or adjusted (or set settings.allow_negative_stock). Find them with: select id, org_id, name_i18n, stock_balance from fp_parts where stock_balance < 0;', n;
  end if;
end $$;

revoke execute on function fp_part_opening_balance(), fp_part_direct_adjustment(), fp_return_part(),
  fp_wo_lines_guard(), fp_wo_labor_rate()
  from public, anon, authenticated;
