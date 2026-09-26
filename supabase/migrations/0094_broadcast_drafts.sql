-- Announcements (fp_broadcasts): a draft (is_published = false) is visible
-- only to the people who write announcements — org admins and managers.
-- Before this, every member could read drafts, and the tenant home screen
-- showed them to occupants.

drop policy if exists broadcasts_select on fp_broadcasts;
create policy broadcasts_select on fp_broadcasts
  for select to authenticated
  using (
    fp_is_member(org_id)
    and (is_published or fp_has_role(org_id, array['org_admin', 'manager']))
  );
