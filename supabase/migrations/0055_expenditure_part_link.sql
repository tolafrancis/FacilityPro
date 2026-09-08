-- 0055_expenditure_part_link.sql
-- Audit follow-up: fp_finance_expenditures already links to a vendor, work
-- order, asset, and cost center (0027 + 0050) but had no link to the parts
-- catalog itself, even though the "Parts" category is the default — an
-- expenditure for a part still required retyping its name as free text
-- instead of selecting the same fp_parts row everything else references.

alter table fp_finance_expenditures
  add column part_id uuid references fp_parts(id) on delete set null;

create index fp_finance_expenditures_part_idx on fp_finance_expenditures (part_id);
