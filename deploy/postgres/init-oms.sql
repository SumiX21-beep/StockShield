DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly') THEN
    CREATE ROLE readonly LOGIN PASSWORD 'readonly';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS oms;

CREATE TABLE IF NOT EXISTS oms.inventory_snapshot (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  sku text NOT NULL,
  location_id text NOT NULL,
  stocked_quantity integer NOT NULL,
  reserved_quantity integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO oms.inventory_snapshot (
  id,
  tenant_id,
  sku,
  location_id,
  stocked_quantity,
  reserved_quantity,
  updated_at
) VALUES (
  'seed-row-1',
  'store_1',
  'DEMO-SKU-1',
  'loc_1',
  10,
  2,
  now()
) ON CONFLICT (id) DO NOTHING;

GRANT CONNECT ON DATABASE stockshield TO readonly;
GRANT USAGE ON SCHEMA oms TO readonly;
GRANT SELECT ON oms.inventory_snapshot TO readonly;
