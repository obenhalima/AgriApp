-- ============================================================
-- TOMATOPILOT — Schéma PostgreSQL Complet
-- Version 1.0 — Gestion de Ferme de Tomates Sous Serre
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. UTILISATEURS & SÉCURITÉ
-- ============================================================

CREATE TYPE user_role AS ENUM (
  'admin', 'direction', 'responsable_ferme',
  'responsable_achats', 'responsable_commercial', 'comptable'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'responsable_ferme',
  avatar_url TEXT,
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. FERMES & SERRES
-- ============================================================

CREATE TYPE greenhouse_type AS ENUM (
  'venlo', 'tunnel', 'chapelle', 'multispan', 'solaire', 'autre'
);

CREATE TYPE greenhouse_status AS ENUM (
  'active', 'en_preparation', 'hors_service', 'renovation'
);

CREATE TABLE farms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  region VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Maroc',
  gps_lat DECIMAL(10, 8),
  gps_lng DECIMAL(11, 8),
  total_area DECIMAL(10, 2), -- en hectares
  manager_id UUID REFERENCES users(id),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE farm_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  area DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE greenhouses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES farm_zones(id),
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  type greenhouse_type NOT NULL DEFAULT 'tunnel',
  status greenhouse_status NOT NULL DEFAULT 'active',
  total_area DECIMAL(10, 2) NOT NULL, -- m²
  exploitable_area DECIMAL(10, 2) NOT NULL, -- m²
  length DECIMAL(8, 2), -- mètres
  width DECIMAL(8, 2), -- mètres
  height DECIMAL(6, 2), -- mètres
  commissioning_date DATE,
  last_renovation_date DATE,
  irrigation_type VARCHAR(100),
  heating_system VARCHAR(100),
  climate_control BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (farm_id, code)
);

-- ============================================================
-- 3. VARIÉTÉS DE TOMATES
-- ============================================================

CREATE TYPE tomato_type AS ENUM (
  'ronde', 'grappe', 'cerise', 'allongee', 'cocktail',
  'beef', 'coeur_de_boeuf', 'olivette', 'autre'
);

CREATE TYPE market_destination AS ENUM (
  'local', 'export', 'mixte', 'grande_distribution', 'industrie'
);

CREATE TABLE seed_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  country VARCHAR(100),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  website TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE varieties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(30) UNIQUE NOT NULL,
  commercial_name VARCHAR(100) NOT NULL,
  scientific_name VARCHAR(100),
  type tomato_type NOT NULL,
  supplier_id UUID REFERENCES seed_suppliers(id),
  destination market_destination DEFAULT 'mixte',
  -- Caractéristiques agronomiques
  estimated_cycle_days INTEGER, -- jours de plantation à fin récolte
  theoretical_yield_per_m2 DECIMAL(6, 2), -- kg/m²/saison
  theoretical_cost_per_m2 DECIMAL(8, 2), -- MAD/m²
  planting_density DECIMAL(6, 2), -- plants/m²
  -- Prix & marché
  avg_price_local DECIMAL(8, 2), -- MAD/kg
  avg_price_export DECIMAL(8, 2), -- EUR/kg
  -- Caractéristiques techniques
  avg_fruit_weight DECIMAL(6, 1), -- grammes
  brix_degree DECIMAL(4, 1), -- degré brix (sucre)
  shelf_life_days INTEGER,
  disease_resistance TEXT[], -- ex: ['TMV', 'Fusarium', 'TYLCV']
  -- Notes
  technical_notes TEXT,
  cultivation_tips TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. CAMPAGNES
-- ============================================================

CREATE TYPE campaign_status AS ENUM (
  'planification', 'en_cours', 'terminee', 'annulee'
);

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL, -- ex: "Campagne 2025-2026"
  farm_id UUID NOT NULL REFERENCES farms(id),
  status campaign_status DEFAULT 'planification',
  -- Dates clés
  preparation_start DATE,
  planting_start DATE,
  harvest_start DATE,
  harvest_end DATE,
  campaign_end DATE,
  -- Budget
  budget_total DECIMAL(12, 2),
  budget_seeds DECIMAL(10, 2),
  budget_fertilizers DECIMAL(10, 2),
  budget_pesticides DECIMAL(10, 2),
  budget_labor DECIMAL(10, 2),
  budget_packaging DECIMAL(10, 2),
  budget_energy DECIMAL(10, 2),
  budget_irrigation DECIMAL(10, 2),
  budget_transport DECIMAL(10, 2),
  budget_other DECIMAL(10, 2),
  -- Objectifs
  production_target_kg DECIMAL(12, 2),
  revenue_target DECIMAL(12, 2),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Affectation variété → serre → campagne
CREATE TABLE campaign_plantings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  greenhouse_id UUID NOT NULL REFERENCES greenhouses(id),
  variety_id UUID NOT NULL REFERENCES varieties(id),
  -- Surfaces
  planted_area DECIMAL(8, 2) NOT NULL, -- m²
  plant_count INTEGER,
  actual_density DECIMAL(6, 2),
  -- Dates
  planting_date DATE,
  first_harvest_date DATE,
  last_harvest_date DATE,
  -- Objectifs
  target_yield_per_m2 DECIMAL(6, 2),
  target_total_production DECIMAL(10, 2), -- kg
  -- Coûts prévisionnels
  estimated_cost DECIMAL(10, 2),
  -- Statut
  status VARCHAR(50) DEFAULT 'planifie',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, greenhouse_id, variety_id)
);

-- ============================================================
-- 5. PRODUCTION & RÉCOLTES
-- ============================================================

CREATE TABLE harvests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_planting_id UUID NOT NULL REFERENCES campaign_plantings(id),
  harvest_date DATE NOT NULL,
  -- Quantités par catégorie
  qty_category_1 DECIMAL(10, 2) DEFAULT 0, -- kg cat 1 (export)
  qty_category_2 DECIMAL(10, 2) DEFAULT 0, -- kg cat 2 (local)
  qty_category_3 DECIMAL(10, 2) DEFAULT 0, -- kg cat 3 (déclassé)
  qty_waste DECIMAL(10, 2) DEFAULT 0,      -- kg déchets
  total_qty DECIMAL(10, 2) GENERATED ALWAYS AS (
    qty_category_1 + qty_category_2 + qty_category_3 + qty_waste
  ) STORED,
  -- Qualité
  avg_fruit_weight DECIMAL(6, 1),
  brix_measure DECIMAL(4, 1),
  quality_notes TEXT,
  -- Traçabilité
  lot_number VARCHAR(50),
  harvested_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE production_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_planting_id UUID NOT NULL REFERENCES campaign_plantings(id),
  week_number INTEGER NOT NULL, -- semaine de l'année
  year INTEGER NOT NULL,
  forecast_qty DECIMAL(10, 2),
  updated_forecast_qty DECIMAL(10, 2), -- mis à jour selon réalisé
  actual_qty DECIMAL(10, 2),
  forecast_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_planting_id, week_number, year)
);

-- ============================================================
-- 6. MARCHÉS
-- ============================================================

CREATE TABLE markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50), -- ex: local, export, GD, grossiste
  country VARCHAR(100),
  zone VARCHAR(100), -- ex: Europe, Afrique, Moyen-Orient
  currency VARCHAR(10) DEFAULT 'MAD',
  avg_price_per_kg DECIMAL(8, 2),
  -- Conditions
  payment_terms VARCHAR(100),
  avg_logistics_cost_per_kg DECIMAL(6, 2),
  avg_packaging_cost_per_kg DECIMAL(6, 2),
  export_fees_per_kg DECIMAL(6, 2),
  -- Notes
  requirements TEXT, -- certifications requises
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE market_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets(id),
  variety_id UUID REFERENCES varieties(id), -- NULL = tous
  price_per_kg DECIMAL(8, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'MAD',
  price_type VARCHAR(20) DEFAULT 'spot', -- spot, contractuel
  valid_from DATE NOT NULL,
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. CLIENTS & VENTES
-- ============================================================

CREATE TYPE client_type AS ENUM (
  'grossiste', 'exportateur', 'grande_surface', 'detail',
  'industrie', 'institutionnel', 'autre'
);

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  type client_type DEFAULT 'grossiste',
  market_id UUID REFERENCES markets(id),
  -- Coordonnées
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Maroc',
  email VARCHAR(255),
  phone VARCHAR(50),
  contact_name VARCHAR(255),
  -- Conditions commerciales
  payment_terms_days INTEGER DEFAULT 30,
  credit_limit DECIMAL(12, 2),
  currency VARCHAR(10) DEFAULT 'MAD',
  preferred_variety_ids UUID[],
  -- Statut
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE order_status AS ENUM (
  'brouillon', 'confirme', 'en_preparation', 'expedie',
  'livre', 'facture', 'annule'
);

CREATE TABLE sales_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(30) UNIQUE NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id),
  campaign_id UUID REFERENCES campaigns(id),
  market_id UUID REFERENCES markets(id),
  status order_status DEFAULT 'brouillon',
  order_date DATE NOT NULL,
  delivery_date DATE,
  -- Prix & totaux
  currency VARCHAR(10) DEFAULT 'MAD',
  exchange_rate DECIMAL(10, 4) DEFAULT 1,
  subtotal DECIMAL(12, 2) DEFAULT 0,
  discount_pct DECIMAL(5, 2) DEFAULT 0,
  tax_pct DECIMAL(5, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) DEFAULT 0,
  -- Livraison
  delivery_address TEXT,
  transport_mode VARCHAR(100),
  -- Notes
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sales_order_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  variety_id UUID NOT NULL REFERENCES varieties(id),
  greenhouse_id UUID REFERENCES greenhouses(id),
  category VARCHAR(20), -- cat1, cat2, cat3
  ordered_qty DECIMAL(10, 2) NOT NULL, -- kg
  delivered_qty DECIMAL(10, 2) DEFAULT 0,
  unit_price DECIMAL(8, 2) NOT NULL,
  line_total DECIMAL(12, 2),
  notes TEXT
);

CREATE TABLE delivery_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dn_number VARCHAR(30) UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES sales_orders(id),
  delivery_date DATE NOT NULL,
  driver_name VARCHAR(100),
  vehicle_plate VARCHAR(20),
  total_qty DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'livre',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(30) UNIQUE NOT NULL,
  invoice_type VARCHAR(20) DEFAULT 'vente', -- vente, avoir
  client_id UUID NOT NULL REFERENCES clients(id),
  order_id UUID REFERENCES sales_orders(id),
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  -- Montants
  currency VARCHAR(10) DEFAULT 'MAD',
  subtotal DECIMAL(12, 2) NOT NULL,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  paid_amount DECIMAL(12, 2) DEFAULT 0,
  balance DECIMAL(12, 2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  -- Statut
  status VARCHAR(30) DEFAULT 'en_attente', -- en_attente, partiellement_paye, paye, en_retard
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments_received (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  payment_date DATE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(50), -- virement, cheque, especes
  reference VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. FOURNISSEURS & ACHATS
-- ============================================================

CREATE TYPE supplier_category AS ENUM (
  'semences', 'engrais', 'phytosanitaires', 'irrigation',
  'emballage', 'transport', 'energie', 'services', 'equipement', 'autre'
);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category supplier_category NOT NULL,
  -- Coordonnées
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Maroc',
  email VARCHAR(255),
  phone VARCHAR(50),
  contact_name VARCHAR(255),
  tax_id VARCHAR(50),
  -- Conditions
  payment_terms_days INTEGER DEFAULT 30,
  credit_limit DECIMAL(12, 2),
  currency VARCHAR(10) DEFAULT 'MAD',
  -- Évaluation
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number VARCHAR(30) UNIQUE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  campaign_id UUID REFERENCES campaigns(id),
  greenhouse_id UUID REFERENCES greenhouses(id),
  cost_category VARCHAR(50), -- semences, engrais, etc.
  status VARCHAR(30) DEFAULT 'brouillon',
  order_date DATE NOT NULL,
  expected_delivery DATE,
  -- Montants
  currency VARCHAR(10) DEFAULT 'MAD',
  subtotal DECIMAL(12, 2) DEFAULT 0,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_description TEXT NOT NULL,
  unit VARCHAR(30), -- kg, L, unité, sac, etc.
  quantity DECIMAL(10, 2) NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  line_total DECIMAL(12, 2),
  received_qty DECIMAL(10, 2) DEFAULT 0,
  stock_item_id UUID -- référence vers le stock si applicable
);

CREATE TABLE supplier_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(30) NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  po_id UUID REFERENCES purchase_orders(id),
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  -- Imputation
  campaign_id UUID REFERENCES campaigns(id),
  greenhouse_id UUID REFERENCES greenhouses(id),
  cost_category VARCHAR(50),
  -- Montants
  currency VARCHAR(10) DEFAULT 'MAD',
  subtotal DECIMAL(12, 2) NOT NULL,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  paid_amount DECIMAL(12, 2) DEFAULT 0,
  balance DECIMAL(12, 2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  status VARCHAR(30) DEFAULT 'en_attente',
  notes TEXT,
  document_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments_made (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_invoice_id UUID NOT NULL REFERENCES supplier_invoices(id),
  payment_date DATE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(50),
  reference VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. COÛTS DE PRODUCTION
-- ============================================================

CREATE TABLE cost_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  greenhouse_id UUID REFERENCES greenhouses(id), -- NULL = campagne globale
  variety_id UUID REFERENCES varieties(id),       -- NULL = toutes variétés
  cost_category VARCHAR(50) NOT NULL,
  -- semences, plants, substrat, engrais, phyto, eau,
  -- energie, main_oeuvre, emballage, transport, frais_export,
  -- maintenance, location, amortissement, divers
  description TEXT,
  supplier_invoice_id UUID REFERENCES supplier_invoices(id),
  amount DECIMAL(12, 2) NOT NULL,
  area_m2 DECIMAL(10, 2), -- surface concernée
  cost_per_m2 DECIMAL(8, 2) GENERATED ALWAYS AS (
    CASE WHEN area_m2 > 0 THEN amount / area_m2 ELSE NULL END
  ) STORED,
  entry_date DATE NOT NULL,
  is_planned BOOLEAN DEFAULT FALSE, -- prévisionnel ou réel
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. STOCKS
-- ============================================================

CREATE TYPE stock_category AS ENUM (
  'semences', 'plants', 'engrais', 'phytosanitaires',
  'emballages', 'consommables', 'pieces_rechange', 'autre'
);

CREATE TABLE stock_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category stock_category NOT NULL,
  unit VARCHAR(30) NOT NULL, -- kg, L, unité, sac, boîte
  supplier_id UUID REFERENCES suppliers(id),
  -- Stock
  current_qty DECIMAL(10, 2) DEFAULT 0,
  min_qty DECIMAL(10, 2) DEFAULT 0, -- seuil d'alerte
  max_qty DECIMAL(10, 2),
  unit_cost DECIMAL(10, 2),
  total_value DECIMAL(12, 2) GENERATED ALWAYS AS (current_qty * unit_cost) STORED,
  -- Notes
  location VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE movement_type AS ENUM ('entree', 'sortie', 'ajustement', 'transfert');

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  movement_type movement_type NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit_cost DECIMAL(10, 2),
  total_cost DECIMAL(12, 2),
  -- Contexte
  movement_date DATE NOT NULL,
  campaign_id UUID REFERENCES campaigns(id),
  greenhouse_id UUID REFERENCES greenhouses(id),
  po_id UUID REFERENCES purchase_orders(id),
  reference VARCHAR(100),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 11. JOURNAL AGRONOMIQUE
-- ============================================================

CREATE TYPE operation_type AS ENUM (
  'traitement', 'irrigation', 'fertilisation', 'taille',
  'effeuillage', 'palissage', 'desherbage', 'recolte',
  'inspection', 'plantation', 'autre'
);

CREATE TABLE cultural_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_planting_id UUID NOT NULL REFERENCES campaign_plantings(id),
  operation_type operation_type NOT NULL,
  operation_date DATE NOT NULL,
  -- Détails
  product_used VARCHAR(255), -- produit appliqué
  dose_per_m2 DECIMAL(8, 3),
  total_quantity DECIMAL(10, 2),
  unit VARCHAR(30),
  duration_hours DECIMAL(6, 2), -- heures de travail
  -- Eau / irrigation
  water_volume_liters DECIMAL(10, 2),
  ec_ms_cm DECIMAL(6, 2), -- conductivité électrique
  ph_value DECIMAL(4, 2),
  -- Conditions météo
  temperature DECIMAL(5, 1),
  humidity_pct DECIMAL(5, 1),
  -- Main d'oeuvre
  worker_count INTEGER,
  -- Résultat
  observations TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 12. MAIN-D'ŒUVRE
-- ============================================================

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(id),
  name VARCHAR(100) NOT NULL,
  team_leader_id UUID REFERENCES users(id),
  specialization VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES teams(id),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  cin VARCHAR(20),
  phone VARCHAR(50),
  daily_rate DECIMAL(8, 2),
  contract_type VARCHAR(50), -- CDI, CDD, saisonnier
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE labor_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES workers(id),
  campaign_id UUID REFERENCES campaigns(id),
  greenhouse_id UUID REFERENCES greenhouses(id),
  operation_type VARCHAR(100),
  work_date DATE NOT NULL,
  hours_worked DECIMAL(5, 2) NOT NULL,
  daily_rate DECIMAL(8, 2),
  total_cost DECIMAL(10, 2) GENERATED ALWAYS AS (
    (hours_worked / 8.0) * daily_rate
  ) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 13. TRAÇABILITÉ
-- ============================================================

CREATE TABLE harvest_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_number VARCHAR(50) UNIQUE NOT NULL,
  harvest_id UUID NOT NULL REFERENCES harvests(id),
  campaign_planting_id UUID NOT NULL REFERENCES campaign_plantings(id),
  harvest_date DATE NOT NULL,
  -- Caractéristiques
  quantity_kg DECIMAL(10, 2) NOT NULL,
  category VARCHAR(20),
  variety_id UUID NOT NULL REFERENCES varieties(id),
  greenhouse_id UUID NOT NULL REFERENCES greenhouses(id),
  -- Destination
  client_id UUID REFERENCES clients(id),
  market_id UUID REFERENCES markets(id),
  sales_order_id UUID REFERENCES sales_orders(id),
  -- Certification
  certification_type VARCHAR(100),
  certificate_number VARCHAR(100),
  -- Conditions de stockage
  storage_temp DECIMAL(4, 1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 14. ALERTES
-- ============================================================

CREATE TYPE alert_type AS ENUM (
  'facture_retard', 'paiement_retard', 'depassement_budget',
  'stock_faible', 'production_faible', 'prix_bas', 'autre'
);

CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type alert_type NOT NULL,
  severity alert_severity DEFAULT 'warning',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(50), -- facture, stock, budget, etc.
  entity_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 15. DOCUMENTS
-- ============================================================

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50) NOT NULL, -- invoice, supplier, client, campaign, etc.
  entity_id UUID NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(50),
  file_size INTEGER,
  category VARCHAR(100), -- facture, contrat, certificat, phytosanitaire
  notes TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEX POUR PERFORMANCE
-- ============================================================

CREATE INDEX idx_greenhouses_farm ON greenhouses(farm_id);
CREATE INDEX idx_campaign_plantings_campaign ON campaign_plantings(campaign_id);
CREATE INDEX idx_campaign_plantings_greenhouse ON campaign_plantings(greenhouse_id);
CREATE INDEX idx_harvests_planting ON harvests(campaign_planting_id);
CREATE INDEX idx_harvests_date ON harvests(harvest_date);
CREATE INDEX idx_cost_entries_campaign ON cost_entries(campaign_id);
CREATE INDEX idx_cost_entries_category ON cost_entries(cost_category);
CREATE INDEX idx_sales_orders_client ON sales_orders(client_id);
CREATE INDEX idx_sales_orders_status ON sales_orders(status);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_supplier_invoices_supplier ON supplier_invoices(supplier_id);
CREATE INDEX idx_stock_movements_item ON stock_movements(stock_item_id);
CREATE INDEX idx_stock_movements_date ON stock_movements(movement_date);
CREATE INDEX idx_labor_entries_campaign ON labor_entries(campaign_id);
CREATE INDEX idx_cultural_operations_planting ON cultural_operations(campaign_planting_id);
CREATE INDEX idx_alerts_read ON alerts(is_read);

-- ============================================================
-- VUES ANALYTIQUES
-- ============================================================

-- Vue: Production par serre et variété
CREATE VIEW v_production_summary AS
SELECT
  c.name AS campaign_name,
  f.name AS farm_name,
  g.code AS greenhouse_code,
  g.name AS greenhouse_name,
  v.commercial_name AS variety_name,
  v.type AS variety_type,
  cp.planted_area,
  cp.target_yield_per_m2,
  cp.target_total_production,
  COALESCE(SUM(h.qty_category_1 + h.qty_category_2 + h.qty_category_3), 0) AS actual_production,
  CASE WHEN cp.planted_area > 0
    THEN COALESCE(SUM(h.qty_category_1 + h.qty_category_2 + h.qty_category_3), 0) / cp.planted_area
    ELSE 0
  END AS actual_yield_per_m2,
  CASE WHEN cp.target_total_production > 0
    THEN (COALESCE(SUM(h.qty_category_1 + h.qty_category_2 + h.qty_category_3), 0) / cp.target_total_production) * 100
    ELSE 0
  END AS achievement_rate
FROM campaign_plantings cp
JOIN campaigns c ON cp.campaign_id = c.id
JOIN greenhouses g ON cp.greenhouse_id = g.id
JOIN farms f ON g.farm_id = f.id
JOIN varieties v ON cp.variety_id = v.id
LEFT JOIN harvests h ON h.campaign_planting_id = cp.id
GROUP BY c.name, f.name, g.code, g.name, v.commercial_name, v.type,
         cp.planted_area, cp.target_yield_per_m2, cp.target_total_production;

-- Vue: Coûts par campagne
CREATE VIEW v_cost_summary AS
SELECT
  campaign_id,
  greenhouse_id,
  cost_category,
  SUM(CASE WHEN is_planned THEN amount ELSE 0 END) AS planned_cost,
  SUM(CASE WHEN NOT is_planned THEN amount ELSE 0 END) AS actual_cost,
  SUM(CASE WHEN NOT is_planned THEN amount ELSE 0 END) -
  SUM(CASE WHEN is_planned THEN amount ELSE 0 END) AS variance
FROM cost_entries
GROUP BY campaign_id, greenhouse_id, cost_category;

-- Vue: Solde clients
CREATE VIEW v_client_balances AS
SELECT
  c.id,
  c.code,
  c.name,
  COUNT(i.id) AS invoice_count,
  SUM(i.total_amount) AS total_invoiced,
  SUM(i.paid_amount) AS total_paid,
  SUM(i.balance) AS outstanding_balance,
  MAX(i.due_date) AS latest_due_date
FROM clients c
LEFT JOIN invoices i ON i.client_id = c.id
WHERE i.status != 'annule'
GROUP BY c.id, c.code, c.name;

-- Vue: Solde fournisseurs
CREATE VIEW v_supplier_balances AS
SELECT
  s.id,
  s.code,
  s.name,
  s.category,
  COUNT(si.id) AS invoice_count,
  SUM(si.total_amount) AS total_invoiced,
  SUM(si.paid_amount) AS total_paid,
  SUM(si.balance) AS outstanding_balance
FROM suppliers s
LEFT JOIN supplier_invoices si ON si.supplier_id = s.id
GROUP BY s.id, s.code, s.name, s.category;

-- ============================================================
-- DONNÉES DE RÉFÉRENCE — FERME DEMO
-- ============================================================

-- Ferme de démo
INSERT INTO farms (code, name, address, city, region, country, total_area)
VALUES ('FERME-01', 'Domaine Souss Agri', 'Route d''Agadir Km 15', 'Ait Melloul', 'Souss-Massa', 'Maroc', 5.2);

-- Fournisseur de semences démo
INSERT INTO seed_suppliers (code, name, country, website)
VALUES 
  ('RIJK-01', 'Rijk Zwaan Maroc', 'Maroc', 'www.rijkzwaan.ma'),
  ('NUNHEMS', 'Nunhems / BASF Vegetable Seeds', 'Pays-Bas', 'www.nunhems.com'),
  ('HAZERA', 'Hazera Seeds', 'Israël', 'www.hazera.com');

-- Variétés de démo
INSERT INTO varieties (code, commercial_name, type, destination, estimated_cycle_days, theoretical_yield_per_m2, theoretical_cost_per_m2, planting_density, avg_price_local, avg_price_export)
VALUES
  ('VAR-001', 'Vitalia', 'ronde', 'mixte', 200, 45, 120, 2.5, 3.2, 0.55),
  ('VAR-002', 'Torero', 'ronde', 'export', 210, 50, 135, 2.5, 3.5, 0.60),
  ('VAR-003', 'Cherry Sun', 'cerise', 'local', 180, 30, 95, 3.0, 8.0, 1.20),
  ('VAR-004', 'Grappe Premium', 'grappe', 'export', 220, 40, 150, 2.2, 5.5, 0.90),
  ('VAR-005', 'Brillante', 'cocktail', 'mixte', 195, 35, 110, 2.8, 6.0, 0.85);

-- Marchés de démo
INSERT INTO markets (code, name, type, country, currency, avg_price_per_kg, avg_logistics_cost_per_kg)
VALUES
  ('MKT-LOC', 'Marché Local Souss', 'local', 'Maroc', 'MAD', 3.2, 0.15),
  ('MKT-GD', 'Grande Distribution Maroc', 'grande_distribution', 'Maroc', 'MAD', 4.5, 0.25),
  ('MKT-FR', 'Export France', 'export', 'France', 'EUR', 0.65, 0.18),
  ('MKT-ES', 'Export Espagne', 'export', 'Espagne', 'EUR', 0.58, 0.12),
  ('MKT-UK', 'Export Royaume-Uni', 'export', 'Royaume-Uni', 'GBP', 0.55, 0.22);
