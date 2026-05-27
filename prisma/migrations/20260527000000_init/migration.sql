-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DriftStatus" AS ENUM ('DETECTED', 'FIX_QUEUED', 'FIXING', 'RETRYING', 'RESOLVED', 'FAILED_MANUAL', 'IGNORED');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('SHOPIFY');

-- CreateEnum
CREATE TYPE "TenantChannelStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "DriftAttemptStatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecheckStatus" AS ENUM ('QUEUED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "DriftEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL DEFAULT 'SHOPIFY',
    "sku" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "omsAvailable" INTEGER NOT NULL,
    "channelAvailable" INTEGER NOT NULL,
    "drift" INTEGER NOT NULL,
    "status" "DriftStatus" NOT NULL DEFAULT 'DETECTED',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriftEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantChannelConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL DEFAULT 'SHOPIFY',
    "status" "TenantChannelStatus" NOT NULL DEFAULT 'ACTIVE',
    "shopDomain" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "apiVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantChannelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSkuLocationMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL DEFAULT 'SHOPIFY',
    "sku" TEXT NOT NULL,
    "omsLocationId" TEXT NOT NULL,
    "shopifyInventoryItemId" TEXT NOT NULL,
    "shopifyLocationId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSkuLocationMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriftScanCursor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL DEFAULT 'SHOPIFY',
    "lastSeenAt" TIMESTAMP(3),
    "lastSeenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriftScanCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriftAttemptLog" (
    "id" TEXT NOT NULL,
    "driftEventId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "DriftAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "targetQuantity" INTEGER,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriftAttemptLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL DEFAULT 'SHOPIFY',
    "operation" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'STARTED',
    "responsePayload" JSONB,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookRecheckEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL DEFAULT 'SHOPIFY',
    "sku" TEXT,
    "locationId" TEXT,
    "sourceEventId" TEXT,
    "status" "RecheckStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookRecheckEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriftEvent_tenantId_channel_status_idx" ON "DriftEvent"("tenantId", "channel", "status");

-- CreateIndex
CREATE INDEX "DriftEvent_tenantId_channel_sku_locationId_idx" ON "DriftEvent"("tenantId", "channel", "sku", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "DriftEvent_open_unique_idx"
ON "DriftEvent"("tenantId", "channel", "sku", "locationId")
WHERE "status" IN ('DETECTED', 'FIX_QUEUED', 'FIXING', 'RETRYING');

-- CreateIndex
CREATE INDEX "TenantChannelConfig_status_idx" ON "TenantChannelConfig"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantChannelConfig_tenantId_channel_key" ON "TenantChannelConfig"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "TenantSkuLocationMap_tenantId_channel_isActive_idx" ON "TenantSkuLocationMap"("tenantId", "channel", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSkuLocationMap_tenantId_channel_sku_omsLocationId_key" ON "TenantSkuLocationMap"("tenantId", "channel", "sku", "omsLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "DriftScanCursor_tenantId_channel_key" ON "DriftScanCursor"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "DriftAttemptLog_driftEventId_status_idx" ON "DriftAttemptLog"("driftEventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_key_key" ON "IdempotencyRecord"("key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_tenantId_channel_operation_idx" ON "IdempotencyRecord"("tenantId", "channel", "operation");

-- CreateIndex
CREATE INDEX "WebhookRecheckEvent_tenantId_channel_status_idx" ON "WebhookRecheckEvent"("tenantId", "channel", "status");

-- AddForeignKey
ALTER TABLE "DriftAttemptLog" ADD CONSTRAINT "DriftAttemptLog_driftEventId_fkey" FOREIGN KEY ("driftEventId") REFERENCES "DriftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
