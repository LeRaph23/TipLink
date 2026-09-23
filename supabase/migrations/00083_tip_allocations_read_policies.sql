-- Let employees and managers read their own tip allocations.
--
-- tip_allocations (00042 group_tip_transfers, renamed in 00075) only ever had
-- the super-admin policy. RLS is on, so every read made with a user's session
-- returned zero rows: the dashboard overview, the staff transactions total and
-- the analytics page all showed 0 € while the statements page, which reads with
-- the service role, showed the real figures. Found by the end-to-end QA run:
-- 4 tips paid, 40,50 € on Stripe and on Relevés, 0 € everywhere else.
--
-- Same scope as transactions_select: an employee sees their own share; a group
-- admin or establishment manager sees the allocations of tips paid to their
-- establishments.

CREATE POLICY tip_alloc_select_own ON public.tip_allocations
  FOR SELECT TO authenticated
  USING (staff_id = get_my_staff_profile_id());

CREATE POLICY tip_alloc_select_managed ON public.tip_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = tip_allocations.transaction_id
        AND (
          t.establishment_id IN (
            SELECT e.id FROM public.establishments e
            WHERE e.group_id = ANY (get_my_group_ids())
          )
          OR t.establishment_id = ANY (get_my_managed_establishment_ids())
        )
    )
  );
