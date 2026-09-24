-- 0075_notification_language.sql
-- Audit finding S5-M2: everything the database writes for people to read
-- (notifications and the emails/SMS/push made from them, default catalogue
-- names, PM work-order titles) was English only.
-- Covered by supabase/security-tests/notification_language.sql.
--
--   * fp_notifications gains title_i18n / body_i18n ({en, vi}), filled on
--     insert from a phrase table, so every existing producer is covered
--     without rewriting it. The bell shows the reader's language.
--   * Email, SMS and push go out in the recipient's language
--     (fp_users_orgs.preferred_lng, else the organisation's default).
--   * The default fault and asset types get real Vietnamese names (only
--     where 'vi' was still the English placeholder).
--   * Work orders generated from a PM schedule are titled in the
--     organisation's default language.

create table if not exists fp_phrases (
  en text primary key,
  vi text not null
);
alter table fp_phrases enable row level security;  -- no policies: used by definer functions

insert into fp_phrases (en, vi) values
  ('New work order assigned',        'Có lệnh công việc mới được giao'),
  ('Low stock',                      'Sắp hết hàng'),
  ('Approval requested',             'Yêu cầu phê duyệt'),
  ('Approval granted',               'Đã được phê duyệt'),
  ('Approval rejected',              'Bị từ chối phê duyệt'),
  ('New message',                    'Tin nhắn mới'),
  ('Work order overdue',             'Lệnh công việc quá hạn'),
  ('Contract expiring',              'Hợp đồng sắp hết hạn'),
  ('License expiring',               'Giấy phép sắp hết hạn'),
  ('Work order reopened',            'Lệnh công việc được mở lại'),
  ('Work order ready to verify',     'Lệnh công việc chờ xác nhận'),
  ('Your request has been resolved', 'Yêu cầu của bạn đã được xử lý'),
  ('Your request is closed',         'Yêu cầu của bạn đã đóng'),
  ('Work order open',                'Lệnh công việc đang mở'),
  ('Work order assigned',            'Lệnh công việc đã được giao'),
  ('Work order in progress',         'Lệnh công việc đang thực hiện'),
  ('Work order on hold',             'Lệnh công việc tạm dừng'),
  ('Work order resolved',            'Lệnh công việc đã xử lý xong'),
  ('Work order verified',            'Lệnh công việc đã được xác nhận'),
  ('Work order closed',              'Lệnh công việc đã đóng'),
  ('Device has never reported.',     'Thiết bị chưa từng gửi dữ liệu.'),
  ('Workflow: assignment',           'Quy trình: phân công'),
  ('Workflow: alert',                'Quy trình: cảnh báo'),
  ('Workflow: survey',               'Quy trình: khảo sát'),
  ('Preventive maintenance',         'Bảo trì định kỳ')
on conflict (en) do update set vi = excluded.vi;

-- Translate one generated sentence; unknown text (names, titles people
-- typed) is returned unchanged.
create or replace function fp_localize(p_text text, p_lng text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
  m text[];
begin
  if p_text is null or coalesce(p_lng, 'en') <> 'vi' then
    return p_text;
  end if;
  select vi into v from fp_phrases where en = p_text;
  if v is not null then
    return v;
  end if;
  m := regexp_match(p_text, '^New message from (.+)$');
  if m is not null then
    return 'Tin nhắn mới từ ' || m[1];
  end if;
  m := regexp_match(p_text, '^No data since (.+)\.$');
  if m is not null then
    return 'Không có dữ liệu từ ' || m[1] || '.';
  end if;
  return p_text;
end;
$$;

alter table fp_notifications
  add column if not exists title_i18n jsonb,
  add column if not exists body_i18n  jsonb;

create or replace function fp_notification_i18n()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.title_i18n := jsonb_build_object('en', new.title, 'vi', fp_localize(new.title, 'vi'));
  new.body_i18n  := case when new.body is null then null
                         else jsonb_build_object('en', new.body, 'vi', fp_localize(new.body, 'vi')) end;
  return new;
end;
$$;

drop trigger if exists trg_fp_notification_i18n on fp_notifications;
create trigger trg_fp_notification_i18n
  before insert on fp_notifications
  for each row execute function fp_notification_i18n();

-- Channels in the recipient's language (0059 version + language).
create or replace function fp_enqueue_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p     record;
  addr  text;
  v_lng text;
  v_title text;
  v_body  text;
begin
  select email_enabled, sms_enabled, push_enabled, phone
    into p
    from fp_notification_prefs
    where user_id = new.user_id;

  if p is null then
    return new;
  end if;

  select coalesce(uo.preferred_lng, o.default_lng, 'en') into v_lng
    from fp_organizations o
    left join fp_users_orgs uo on uo.org_id = o.id and uo.user_id = new.user_id
    where o.id = new.org_id;
  v_title := coalesce(new.title_i18n ->> v_lng, new.title);
  v_body  := coalesce(new.body_i18n ->> v_lng, new.body);

  if coalesce(p.email_enabled, false) then
    select email into addr from auth.users where id = new.user_id;
    if addr is not null then
      insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
      values (new.org_id, new.user_id, 'email', addr, v_title, v_body);
    end if;
  end if;

  if coalesce(p.sms_enabled, false) and p.phone is not null and length(p.phone) > 0 then
    insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
    values (new.org_id, new.user_id, 'sms', p.phone, v_title,
            v_title || coalesce(' — ' || nullif(v_body, ''), ''));
  end if;

  if coalesce(p.push_enabled, false) then
    insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
    values (new.org_id, new.user_id, 'push', new.user_id::text, v_title, v_body);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Default catalogue names in Vietnamese
-- ---------------------------------------------------------------------------
create table if not exists fp_catalog_vi (en text primary key, vi text not null);
alter table fp_catalog_vi enable row level security;
insert into fp_catalog_vi (en, vi) values
  ('Mechanical Failure', 'Hỏng cơ khí'), ('Electrical Failure', 'Hỏng điện'),
  ('Plumbing Issue', 'Sự cố đường ống nước'), ('HVAC Fault', 'Lỗi hệ thống HVAC'),
  ('Air Conditioning Failure', 'Hỏng điều hòa'), ('Water Leak', 'Rò rỉ nước'),
  ('Gas Leak', 'Rò rỉ khí gas'), ('Lighting Fault', 'Lỗi chiếu sáng'),
  ('Power Outage', 'Mất điện'), ('Equipment Breakdown', 'Hỏng thiết bị'),
  ('Motor Failure', 'Hỏng động cơ'), ('Pump Failure', 'Hỏng máy bơm'),
  ('Sensor Failure', 'Hỏng cảm biến'), ('Calibration Required', 'Cần hiệu chuẩn'),
  ('Preventive Maintenance', 'Bảo trì định kỳ'), ('Corrective Maintenance', 'Bảo trì khắc phục'),
  ('Emergency Repair', 'Sửa chữa khẩn cấp'), ('Safety Hazard', 'Nguy cơ mất an toàn'),
  ('Fire Alarm Fault', 'Lỗi báo cháy'), ('Network / IT Equipment Fault', 'Lỗi mạng / thiết bị CNTT'),
  ('Building Fabric Damage', 'Hư hỏng kết cấu tòa nhà'), ('Door / Window Fault', 'Lỗi cửa / cửa sổ'),
  ('Roofing Issue', 'Sự cố mái nhà'), ('Cleaning Request', 'Yêu cầu vệ sinh'),
  ('Pest Control', 'Kiểm soát côn trùng'), ('Other', 'Khác'),
  ('HVAC Unit', 'Thiết bị HVAC'), ('Air Conditioner', 'Máy điều hòa'), ('Generator', 'Máy phát điện'),
  ('Chiller', 'Máy làm lạnh (chiller)'), ('Boiler', 'Nồi hơi'), ('Pump', 'Máy bơm'), ('Motor', 'Động cơ'),
  ('Electrical Panel', 'Tủ điện'), ('Transformer', 'Máy biến áp'), ('Lighting Fixture', 'Đèn chiếu sáng'),
  ('Elevator', 'Thang máy'), ('Escalator', 'Thang cuốn'), ('Fire Alarm System', 'Hệ thống báo cháy'),
  ('CCTV Camera', 'Camera CCTV'), ('Access Control System', 'Hệ thống kiểm soát ra vào'),
  ('Water Tank', 'Bồn nước'), ('Plumbing Fixture', 'Thiết bị vệ sinh'), ('Compressor', 'Máy nén khí'),
  ('UPS', 'Bộ lưu điện (UPS)'), ('Server', 'Máy chủ'), ('Computer', 'Máy tính'), ('Printer', 'Máy in'),
  ('Vehicle', 'Phương tiện'), ('Building', 'Tòa nhà'), ('Room', 'Phòng')
on conflict (en) do update set vi = excluded.vi;

update fp_fault_types f set name_i18n = f.name_i18n || jsonb_build_object('vi', c.vi)
  from fp_catalog_vi c
  where c.en = f.name_i18n ->> 'en' and coalesce(f.name_i18n ->> 'vi', '') in ('', f.name_i18n ->> 'en');
update fp_asset_types a set name_i18n = a.name_i18n || jsonb_build_object('vi', c.vi)
  from fp_catalog_vi c
  where c.en = a.name_i18n ->> 'en' and coalesce(a.name_i18n ->> 'vi', '') in ('', a.name_i18n ->> 'en');

-- New organisations: the seed functions insert vi = en; fix on the way in.
create or replace function fp_catalog_vi_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v text;
begin
  if coalesce(new.name_i18n ->> 'vi', '') in ('', new.name_i18n ->> 'en') then
    select vi into v from fp_catalog_vi where en = new.name_i18n ->> 'en';
    if v is not null then
      new.name_i18n := new.name_i18n || jsonb_build_object('vi', v);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_fault_types_vi on fp_fault_types;
create trigger trg_fp_fault_types_vi before insert on fp_fault_types
  for each row execute function fp_catalog_vi_fill();
drop trigger if exists trg_fp_asset_types_vi on fp_asset_types;
create trigger trg_fp_asset_types_vi before insert on fp_asset_types
  for each row execute function fp_catalog_vi_fill();

-- ---------------------------------------------------------------------------
-- PM work orders titled in the organisation's language
-- ---------------------------------------------------------------------------
create or replace function fp_pm_wo_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names jsonb;
  v_lng   text;
begin
  if new.pm_schedule_id is null then
    return new;
  end if;
  select s.name_i18n, o.default_lng into v_names, v_lng
    from fp_pm_schedules s join fp_organizations o on o.id = s.org_id
    where s.id = new.pm_schedule_id;
  -- Only replace the generator's English default, never a title someone set.
  if new.title is not distinct from coalesce(v_names ->> 'en', v_names ->> 'vi', 'Preventive maintenance') then
    new.title := coalesce(nullif(v_names ->> v_lng, ''), fp_localize(new.title, v_lng));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_pm_wo_title on fp_work_orders;
create trigger trg_fp_pm_wo_title
  before insert on fp_work_orders
  for each row execute function fp_pm_wo_title();

revoke execute on function fp_localize(text, text), fp_notification_i18n(), fp_catalog_vi_fill(), fp_pm_wo_title()
  from public, anon, authenticated;
