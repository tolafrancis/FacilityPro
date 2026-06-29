-- 0043_device_broker_connections.sql
-- Outbound broker connections for devices. Unlike the push/ingest model (where a
-- device or broker POSTs to fp_device_ingest), this stores the coordinates of an
-- MQTT broker we should connect OUT to and subscribe on the device's behalf.
--
-- The app itself is serverless and cannot hold a persistent socket, so a small
-- standalone worker (see /mqtt-bridge) reads enabled rows here, keeps a live MQTT
-- subscription per row, and forwards each message to fp_device_ingest using the
-- owning device's key. This table is just the configuration + last-known status.

create table fp_device_connections (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references fp_organizations(id) on delete cascade,
  device_id         uuid not null unique references fp_devices(id) on delete cascade,
  protocol          text not null default 'mqtt'
                      check (protocol in ('mqtt','mqtts','ws','wss')),
  host              text not null,
  port              int  not null default 1883,
  topic             text not null,                      -- subscription topic / filter
  username          text,
  password          text,                               -- broker secret; admin-only via RLS
  client_id         text,                               -- optional fixed MQTT client id
  qos               int  not null default 0 check (qos in (0,1,2)),
  enabled           boolean not null default true,
  last_connected_at timestamptz,                        -- worker heartbeat: last successful connect
  last_error        text,                               -- worker heartbeat: last connection/parse error
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index fp_device_connections_org_idx on fp_device_connections (org_id);

create trigger trg_fp_device_connections_touch
  before update on fp_device_connections for each row execute function fp_touch_updated_at();

create trigger trg_audit_device_connections after insert or update or delete
  on fp_device_connections for each row execute function fp_audit();

-- ---------------------------------------------------------------------------
-- RLS. Rows carry broker credentials, so reads are limited to admins/managers
-- (same visibility as the device key) and writes to admins.
-- ---------------------------------------------------------------------------
alter table fp_device_connections enable row level security;

create policy devconn_select on fp_device_connections for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
create policy devconn_write on fp_device_connections for all to authenticated
  using ( fp_has_role(org_id, array['org_admin']) )
  with check ( fp_has_role(org_id, array['org_admin']) );
