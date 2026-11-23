-- Set company_code with psql -v. Returns one JSON document for the selected company.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH company AS (SELECT id, code FROM public.domains WHERE code = :'company_code'),
farms AS (
  SELECT f.* FROM public.farms f JOIN company c ON c.id = f.domain_id
), greenhouses AS (
  SELECT g.*, f.code AS farm_code FROM public.greenhouses g JOIN farms f ON f.id = g.farm_id
)
SELECT jsonb_build_object(
  'company_code', c.code,
  'farms', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'code', f.code, 'name', f.name, 'city', f.city, 'country', f.country, 'area', f.total_area,
      'active', f.is_active, 'manager_link', f.manager_id IS NOT NULL,
      'attributes', jsonb_build_object('address', f.address, 'region', f.region,
        'gps_lat', f.gps_lat, 'gps_lng', f.gps_lng, 'notes', f.notes)
    ) ORDER BY f.code) FROM farms f
  ), '[]'::jsonb),
  'greenhouses', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'farm_code', g.farm_code, 'code', g.code, 'name', g.name, 'type', g.type, 'status', g.status,
      'total', g.total_area, 'usable', g.exploitable_area, 'zone_link', g.zone_id IS NOT NULL,
      'attributes', jsonb_build_object('length', g.length, 'width', g.width, 'height', g.height,
        'commissioning_date', g.commissioning_date, 'last_renovation_date', g.last_renovation_date,
        'irrigation_type', g.irrigation_type, 'heating_system', g.heating_system,
        'climate_control', g.climate_control, 'notes', g.notes)
    ) ORDER BY g.farm_code, g.code) FROM greenhouses g
  ), '[]'::jsonb)
) AS snapshot
FROM company c;

ROLLBACK;
