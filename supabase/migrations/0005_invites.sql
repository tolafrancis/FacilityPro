-- 0005_invites.sql
-- Org invitations. Admin creates an invite; invitee accepts via token.

create table fp_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  email      text not null,
  role       text not null check (role in
                ('org_admin','manager','technician','occupant','vendor')),
  token      uuid not null default gen_random_uuid(),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create unique index fp_invites_token_idx on fp_invites (token);
create index fp_invites_org_idx on fp_invites (org_id);
create index fp_invites_email_idx on fp_invites (lower(email));
