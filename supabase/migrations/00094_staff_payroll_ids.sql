-- ============================================================
-- Payroll numbers (matricules) for the payroll-software export
--
-- Every French payroll package (Silae, Sage, Cegid, PayFit…) imports variable
-- pay items keyed on the employee's matricule, the number the payroll software
-- itself assigned. Without it, the accountant retypes each tip total by hand,
-- which is the work the export exists to remove.
--
-- A table of its own rather than a column on staff_profiles: the
-- staff_profiles_update policy (00002) lets an employee edit their own row,
-- for their name and photo. A matricule decides whose payslip a sum lands on,
-- so only the people who run payroll may write it — and the employee does not
-- need to read it either.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_payroll_ids (
  staff_id   uuid PRIMARY KEY REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  payroll_id text NOT NULL CHECK (char_length(btrim(payroll_id)) BETWEEN 1 AND 32),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_payroll_ids IS
  'Employee number in the group''s payroll software, used as the key of the payroll import file. Managers only.';

ALTER TABLE public.staff_payroll_ids ENABLE ROW LEVEL SECURITY;

-- Same reach as the managers' half of staff_profiles_update, without the
-- `user_id = auth.uid()` branch.
DROP POLICY IF EXISTS "staff_payroll_ids_manage" ON public.staff_payroll_ids;
CREATE POLICY "staff_payroll_ids_manage" ON public.staff_payroll_ids
  FOR ALL
  USING (
    is_super_admin()
    OR staff_id IN (
      SELECT sp.id FROM public.staff_profiles sp
      WHERE sp.establishment_id = ANY(get_my_managed_establishment_ids())
         OR sp.establishment_id IN (
           SELECT e.id FROM public.establishments e WHERE e.group_id = ANY(get_my_group_ids())
         )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR staff_id IN (
      SELECT sp.id FROM public.staff_profiles sp
      WHERE sp.establishment_id = ANY(get_my_managed_establishment_ids())
         OR sp.establishment_id IN (
           SELECT e.id FROM public.establishments e WHERE e.group_id = ANY(get_my_group_ids())
         )
    )
  );
