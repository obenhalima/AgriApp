# 106B — Stock par entrepôt

Implémentation préparée ; application SQL et recette base de données en attente.

1. Appliquer 106_warehouse_registry.sql si 106A n'a pas encore été appliqué.
2. Appliquer 106b_warehouse_balances.sql intégralement, une seule fois.
3. Actualiser Stocks et choisir un entrepôt.
4. Vérifier les scénarios de supabase/verification/106b_warehouse_checks.sql.

La migration copie les soldes actuels dans l'entrepôt principal, sans rejouer
les anciens mouvements. Elle refuse les soldes initiaux négatifs ou un client
ayant du stock sans entrepôt principal. Les seuils actuels deviennent ceux
de l'entrepôt principal. Les autres seuils se règlent dans Stocks après filtrage.

Les entrées et sorties choisissent un entrepôt. Les sorties conservent le
workflow existant de demande, validation et exécution. La base vérifie le solde
local à l'exécution et verrouille l'article pour éviter les doubles consommations.
Les mouvements historiques ne peuvent plus être modifiés ou supprimés directement.

Les anciens traitements utilisent encore l'entrepôt principal : leur sélection
d'entrepôt et le prévisionnel par occurrence appartiennent au lot 107.
Le total historique de stock_items conserve sa précision de deux décimales ;
les soldes par entrepôt conservent quatre décimales.

Le formulaire propose entrées et sorties. Les diminutions correctives passent
par une demande de sortie motivée ; aucun ajustement libre ne contourne la validation.
Les réceptions suivent les règles existantes ; leur circuit de validation dédié
n'est pas changé dans ce sous-lot.

Vérification réalisée : transpilation syntaxique des trois fichiers TypeScript
modifiés. Pas de build production lancé sur le serveur de développement.
Les scénarios transactionnels doivent encore être exécutés après migration.
