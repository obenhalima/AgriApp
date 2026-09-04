-- ============================================================
-- Contrôles manuels de la migration 072
-- Lecture seule : ce fichier ne modifie aucune donnée.
-- À exécuter avant et après la migration selon les sections.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- A. AVANT migration
-- ────────────────────────────────────────────────────────────

-- A1. Profils actifs sans rôle : attendu = 0
SELECT COUNT(*) AS active_profiles_without_role
FROM public.profiles
WHERE is_active = TRUE
  AND role_id IS NULL;

-- A2. Profils actifs avec rôle inactif : attendu = 0
SELECT COUNT(*) AS active_profiles_with_inactive_role
FROM public.profiles p
JOIN public.roles r ON r.id = p.role_id
WHERE p.is_active = TRUE
  AND r.is_active = FALSE;

-- A3. Répartition actuelle des profils par rôle
SELECT
  r.code AS role_code,
  r.name AS role_name,
  r.is_admin,
  r.is_active,
  COUNT(*) AS profile_count
FROM public.profiles p
LEFT JOIN public.roles r ON r.id = p.role_id
GROUP BY r.code, r.name, r.is_admin, r.is_active
ORDER BY profile_count DESC, r.code;

-- A4. Comptage de référence
SELECT
  COUNT(*) AS total_profiles,
  COUNT(*) FILTER (WHERE is_active) AS active_profiles
FROM public.profiles;

-- ────────────────────────────────────────────────────────────
-- B. APRÈS migration
-- ────────────────────────────────────────────────────────────

-- B1. Domaine initial : attendu = exactement 1
SELECT id, code, name, is_active, currency, timezone, locale
FROM public.domains
WHERE upper(code) = 'DOM-BENHALIMA';

-- B2. Couverture des profils actifs : valeurs attendues identiques
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE is_active = TRUE)
    AS active_profiles,
  (
    SELECT COUNT(*)
    FROM public.domain_memberships dm
    JOIN public.domains d ON d.id = dm.domain_id
    WHERE upper(d.code) = 'DOM-BENHALIMA'
      AND dm.is_active = TRUE
  ) AS active_memberships;

-- B3. Profils actifs non rattachés : attendu = aucune ligne
SELECT p.id, p.email
FROM public.profiles p
WHERE p.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.domain_memberships dm
    WHERE dm.user_id = p.id
      AND dm.is_active = TRUE
  );

-- B4. Plusieurs domaines par défaut : attendu = aucune ligne
SELECT user_id, COUNT(*) AS default_count
FROM public.domain_memberships
WHERE is_default = TRUE
GROUP BY user_id
HAVING COUNT(*) > 1;

-- B5. Appartenances incohérentes : attendu = aucune ligne
SELECT dm.id, dm.user_id, dm.domain_id, dm.role_id
FROM public.domain_memberships dm
JOIN public.profiles p ON p.id = dm.user_id
JOIN public.domains d ON d.id = dm.domain_id
JOIN public.roles r ON r.id = dm.role_id
WHERE dm.is_active = TRUE
  AND (p.is_active = FALSE OR d.is_active = FALSE OR r.is_active = FALSE);

-- B6. Aucun super-administrateur n'est attribué automatiquement.
-- Une ligne n'est légitime qu'après attribution manuelle explicite.
SELECT id, email, is_platform_admin
FROM public.profiles
WHERE is_platform_admin = TRUE;

-- B7. Vue de contrôle des appartenances (sans secrets)
SELECT
  p.email,
  d.code AS domain_code,
  r.code AS role_code,
  dm.is_active,
  dm.is_default
FROM public.domain_memberships dm
JOIN public.profiles p ON p.id = dm.user_id
JOIN public.domains d ON d.id = dm.domain_id
JOIN public.roles r ON r.id = dm.role_id
ORDER BY p.email, d.code;

