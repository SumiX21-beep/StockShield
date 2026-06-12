-- CreateEnum
CREATE TYPE "InventoryLedgerMovementType" AS ENUM ('STOCK_ADDED', 'ORDER_RESERVED', 'ORDER_CANCELLED', 'ORDER_FULFILLED', 'RETURN_RESTOCKED', 'MANUAL_ADJUSTMENT', 'WAREHOUSE_CORRECTION');

-- CreateEnum
CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "OmsOrderStatus" AS ENUM ('RESERVED', 'CANCELLED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "InventorySyncStatus" AS ENUM ('QUEUED', 'SYNCING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "InventorySyncAttemptStatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "DriftRootCause" AS ENUM ('FAILED_SYNC', 'MANUAL_SHOPIFY_EDIT', 'MAPPING_MISSING', 'RESERVATION_MISMATCH', 'RETURN_CANCEL_MISMATCH', 'SHOPIFY_API_FAILURE', 'UNKNOWN');

-- AlterTable
ALTER TABLE "DriftEvent"
ADD COLUMN "rootCause" "DriftRootCause",
ADD COLUMN "expectedSellable" INTEGER,
ADD COLUMN "shopifyAvailable" INTEGER,
ADD COLUMN "lastSyncJobId" TEXT,
ADD COLUMN "lostRevenueRisk" INTEGER;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "safetyBuffer" INTEGER NOT NULL DEFAULT 0,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "physicalQuantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "safetyBuffer" INTEGER NOT NULL DEFAULT 0,
    "sellableQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "movementType" "InventoryLedgerMovementType" NOT NULL,
    "physicalDelta" INTEGER NOT NULL DEFAULT 0,
    "reservedDelta" INTEGER NOT NULL DEFAULT 0,
    "physicalQuantityAfter" INTEGER NOT NULL,
    "reservedQuantityAfter" INTEGER NOT NULL,
    "sellableQuantityAfter" INTEGER NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OmsOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalOrderId" TEXT,
    "status" "OmsOrderStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OmsOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OmsOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OmsOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySyncOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "targetSellableQuantity" INTEGER NOT NULL,
    "status" "InventorySyncStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "lastError" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySyncOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySyncAttempt" (
    "id" TEXT NOT NULL,
    "syncJobId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "InventorySyncAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "targetSellableQuantity" INTEGER NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventorySyncAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriftEvent_tenantId_rootCause_idx" ON "DriftEvent"("tenantId", "rootCause");

-- CreateIndex
CREATE INDEX "Product_tenantId_isActive_idx" ON "Product"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_tenantId_sku_key" ON "Sku"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "Sku_tenantId_isActive_idx" ON "Sku"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseLocation_tenantId_locationId_key" ON "WarehouseLocation"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "WarehouseLocation_tenantId_isActive_idx" ON "WarehouseLocation"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_tenantId_sku_locationId_key" ON "InventoryBalance"("tenantId", "sku", "locationId");

-- CreateIndex
CREATE INDEX "InventoryBalance_tenantId_locationId_idx" ON "InventoryBalance"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "InventoryBalance_tenantId_sku_idx" ON "InventoryBalance"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_tenantId_sku_locationId_createdAt_idx" ON "InventoryLedgerEntry"("tenantId", "sku", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_tenantId_movementType_createdAt_idx" ON "InventoryLedgerEntry"("tenantId", "movementType", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_sourceType_sourceId_idx" ON "InventoryLedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OmsOrder_tenantId_externalOrderId_key" ON "OmsOrder"("tenantId", "externalOrderId");

-- CreateIndex
CREATE INDEX "OmsOrder_tenantId_status_createdAt_idx" ON "OmsOrder"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OmsOrderLine_tenantId_sku_locationId_idx" ON "OmsOrderLine"("tenantId", "sku", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_orderLineId_key" ON "StockReservation"("orderLineId");

-- CreateIndex
CREATE INDEX "StockReservation_tenantId_sku_locationId_status_idx" ON "StockReservation"("tenantId", "sku", "locationId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_tenantId_orderId_idx" ON "StockReservation"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySyncOutbox_idempotencyKey_key" ON "InventorySyncOutbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventorySyncOutbox_tenantId_status_createdAt_idx" ON "InventorySyncOutbox"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "InventorySyncOutbox_tenantId_sku_locationId_createdAt_idx" ON "InventorySyncOutbox"("tenantId", "sku", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "InventorySyncAttempt_syncJobId_status_idx" ON "InventorySyncAttempt"("syncJobId", "status");

-- CreateIndex
CREATE INDEX "InventorySyncAttempt_tenantId_status_createdAt_idx" ON "InventorySyncAttempt"("tenantId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmsOrderLine" ADD CONSTRAINT "OmsOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OmsOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OmsOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySyncAttempt" ADD CONSTRAINT "InventorySyncAttempt_syncJobId_fkey" FOREIGN KEY ("syncJobId") REFERENCES "InventorySyncOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
