-- ============================================================
-- Module 'imports' : import de données via templates + mapping dynamique
-- Ajoute le module, les permissions et les accorde à l'admin + direction + comptable
-- ============================================================

INSERT INTO modules (code, label, icon, color, path, section, display_order)
VALUES ('imports', 'Imports', '📥', '#06b6d4', '/admin/imports', 'PARAMETRAGE', 25)
ON CONFLICT (code) DO NOTHING;

-- Générer les permissions pour ce nouveau module (5 actions)
INSERT INTO permissions (module_id, action, code)
SELECT m.id, a.action, m.code || '.' || a.action
FROM modules m
CROSS JOIN (
  VALUES ('view'::permission_action), ('create'::permission_action), ('edit'::permission_action), ('delete'::permission_action), ('admin'::permission_action)
) AS a(action)
WHERE m.code = 'imports'
ON CONFLICT (code) DO NOTHING;

-- Direction : voir seulement (audit)
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p, modules m
WHERE r.code = 'direction' AND p.module_id = m.id AND m.code = 'imports' AND p.action = 'view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Comptable : view + create (peut importer coûts / budgets / achats)
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p, modules m
WHERE r.code = 'comptable' AND p.module_id = m.id AND m.code = 'imports' AND p.action IN ('view','create')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Chef d'exploitation : view + create (peut importer récoltes + achats)
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p, modules m
WHERE r.code = 'chef_exploitation' AND p.module_id = m.id AND m.code = 'imports' AND p.action IN ('view','create')
ON CONFLICT (role_id, permission_id) DO NOTHING;
