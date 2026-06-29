-- 0042_request_asset_type.sql
-- A fault report / request can reference an asset TYPE (category) in addition to
-- a specific asset — useful when the exact asset isn't registered yet, and so
-- workflows can key off the asset type.

alter table fp_requests
  add column if not exists asset_type_id uuid references fp_asset_types(id) on delete set null;
