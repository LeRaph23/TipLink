-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER avoids RLS recursion)
-- ============================================================

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION get_my_group_ids()
RETURNS UUID[] LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT ARRAY_AGG(group_id) FROM user_roles
  WHERE user_id = auth.uid() AND role = 'group_admin' AND group_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION get_my_managed_establishment_ids()
RETURNS UUID[] LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT ARRAY_AGG(establishment_id) FROM user_roles
  WHERE user_id = auth.uid()
    AND role = 'manager'
    AND establishment_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION get_my_staff_establishment_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT establishment_id FROM staff_profiles
  WHERE user_id = auth.uid() AND deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_my_staff_profile_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM staff_profiles
  WHERE user_id = auth.uid() AND deleted_at IS NULL
  LIMIT 1;
$$;

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE establishments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfc_stickers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GROUPS
-- ============================================================
CREATE POLICY "groups_select" ON groups FOR SELECT USING (
  is_super_admin()
  OR id = ANY(get_my_group_ids())
  AND deleted_at IS NULL
);

CREATE POLICY "groups_insert" ON groups FOR INSERT WITH CHECK (
  is_super_admin()
);

CREATE POLICY "groups_update" ON groups FOR UPDATE
  USING (is_super_admin() OR id = ANY(get_my_group_ids()))
  WITH CHECK (is_super_admin() OR id = ANY(get_my_group_ids()));

-- ============================================================
-- ESTABLISHMENTS
-- ============================================================
CREATE POLICY "establishments_select" ON establishments FOR SELECT USING (
  deleted_at IS NULL AND (
    is_super_admin()
    OR group_id = ANY(get_my_group_ids())
    OR id = ANY(get_my_managed_establishment_ids())
    OR id = get_my_staff_establishment_id()
  )
);

CREATE POLICY "establishments_insert" ON establishments FOR INSERT WITH CHECK (
  is_super_admin()
  OR group_id = ANY(get_my_group_ids())
);

CREATE POLICY "establishments_update" ON establishments FOR UPDATE
  USING (
    is_super_admin()
    OR group_id = ANY(get_my_group_ids())
    OR id = ANY(get_my_managed_establishment_ids())
  )
  WITH CHECK (
    is_super_admin()
    OR group_id = ANY(get_my_group_ids())
    OR id = ANY(get_my_managed_establishment_ids())
  );

-- ============================================================
-- STAFF PROFILES
-- ============================================================
CREATE POLICY "staff_profiles_select" ON staff_profiles FOR SELECT USING (
  deleted_at IS NULL AND (
    is_super_admin()
    OR establishment_id = ANY(
      SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
    )
    OR establishment_id = ANY(get_my_managed_establishment_ids())
    OR user_id = auth.uid()
  )
);

CREATE POLICY "staff_profiles_insert" ON staff_profiles FOR INSERT WITH CHECK (
  is_super_admin()
  OR establishment_id = ANY(get_my_managed_establishment_ids())
  OR establishment_id = ANY(
    SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
  )
);

CREATE POLICY "staff_profiles_update" ON staff_profiles FOR UPDATE
  USING (
    is_super_admin()
    OR establishment_id = ANY(get_my_managed_establishment_ids())
    OR establishment_id = ANY(
      SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
    )
    OR user_id = auth.uid()
  )
  WITH CHECK (
    is_super_admin()
    OR establishment_id = ANY(get_my_managed_establishment_ids())
    OR establishment_id = ANY(
      SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
    )
    OR user_id = auth.uid()
  );

-- ============================================================
-- NFC STICKERS
-- ============================================================
CREATE POLICY "nfc_stickers_select" ON nfc_stickers FOR SELECT USING (
  is_super_admin()
  OR establishment_id = ANY(get_my_managed_establishment_ids())
  OR establishment_id = ANY(
    SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
  )
  OR staff_id IN (
    SELECT id FROM staff_profiles
    WHERE establishment_id = ANY(get_my_managed_establishment_ids())
  )
  OR staff_id = get_my_staff_profile_id()
);

CREATE POLICY "nfc_stickers_insert" ON nfc_stickers FOR INSERT WITH CHECK (
  is_super_admin()
  OR establishment_id = ANY(get_my_managed_establishment_ids())
  OR establishment_id = ANY(
    SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
  )
);

CREATE POLICY "nfc_stickers_update" ON nfc_stickers FOR UPDATE
  USING (
    is_super_admin()
    OR establishment_id = ANY(get_my_managed_establishment_ids())
    OR establishment_id = ANY(
      SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
    )
    OR staff_id IN (
      SELECT id FROM staff_profiles
      WHERE establishment_id = ANY(get_my_managed_establishment_ids())
    )
  )
  WITH CHECK (true);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (
  is_super_admin()
  OR establishment_id = ANY(
    SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
  )
  OR establishment_id = ANY(get_my_managed_establishment_ids())
  OR staff_id = get_my_staff_profile_id()
);

-- INSERT is ONLY done by service_role (webhooks). No authenticated user policy.

-- ============================================================
-- WEBHOOK EVENTS — service_role only, deny all users
-- ============================================================
CREATE POLICY "webhook_events_deny_all" ON webhook_events FOR ALL USING (false);

-- ============================================================
-- USER ROLES
-- ============================================================
CREATE POLICY "user_roles_select_own" ON user_roles FOR SELECT USING (
  user_id = auth.uid()
  OR is_super_admin()
  OR group_id = ANY(get_my_group_ids())
  OR establishment_id = ANY(get_my_managed_establishment_ids())
);

CREATE POLICY "user_roles_manage" ON user_roles FOR ALL
  USING (
    is_super_admin()
    OR group_id = ANY(get_my_group_ids())
    OR establishment_id = ANY(
      SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
    )
  )
  WITH CHECK (
    is_super_admin()
    OR group_id = ANY(get_my_group_ids())
    OR establishment_id = ANY(
      SELECT id FROM establishments WHERE group_id = ANY(get_my_group_ids())
    )
  );
