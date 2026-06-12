-- CreateEnum
CREATE TYPE "HybridOrderStatus" AS ENUM ('CREATED', 'RESERVED', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "HybridDriftStatus" AS ENUM ('DETECTED', 'FIX_QUEUED', 'FIXING', 'RESOLVED', 'FAILED_MANUAL', 'IGNORED');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'demo',
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'demo',
    "sku" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "physical_quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'demo',
    "sku" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "HybridOrderStatus" NOT NULL DEFAULT 'CREATED',
    "failure_reason" TEXT,
    "queued_at" TIMESTAMP(3),
    "reserved_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "external_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_inventory" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'demo',
    "sku" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "available_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'demo',
    "core_order_id" TEXT,
    "sku" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "request_payload" JSONB,
    "response_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_drift" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'demo',
    "sku" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "expected_qty" INTEGER NOT NULL,
    "actual_qty" INTEGER NOT NULL,
    "status" "HybridDriftStatus" NOT NULL DEFAULT 'DETECTED',
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_drift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_tenant_id_sku_location_id_key" ON "inventory"("tenant_id", "sku", "location_id");

-- CreateIndex
CREATE INDEX "inventory_tenant_id_sku_idx" ON "inventory"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "inventory_tenant_id_location_id_idx" ON "inventory"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_status_created_at_idx" ON "orders"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_tenant_id_sku_location_id_idx" ON "orders"("tenant_id", "sku", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_inventory_tenant_id_sku_location_id_key" ON "external_inventory"("tenant_id", "sku", "location_id");

-- CreateIndex
CREATE INDEX "external_inventory_tenant_id_sku_idx" ON "external_inventory"("tenant_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "external_orders_core_order_id_key" ON "external_orders"("core_order_id");

-- CreateIndex
CREATE INDEX "external_orders_tenant_id_created_at_idx" ON "external_orders"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_drift_tenant_id_status_created_at_idx" ON "inventory_drift"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "inventory_drift_tenant_id_sku_location_id_idx" ON "inventory_drift"("tenant_id", "sku", "location_id");
