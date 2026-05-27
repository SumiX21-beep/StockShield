-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('SLACK');

-- CreateEnum
CREATE TYPE "AlertDeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertDeliveryLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driftEventId" TEXT,
    "channel" "AlertChannel" NOT NULL DEFAULT 'SLACK',
    "status" "AlertDeliveryStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuRiskSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "driftCount24h" INTEGER NOT NULL DEFAULT 0,
    "lastDriftAt" TIMESTAMP(3),
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkuRiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_idx" ON "TenantMembership"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_userId_tenantId_key" ON "TenantMembership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "AlertDeliveryLog_tenantId_status_createdAt_idx" ON "AlertDeliveryLog"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AlertDeliveryLog_driftEventId_idx" ON "AlertDeliveryLog"("driftEventId");

-- CreateIndex
CREATE INDEX "SkuRiskSnapshot_tenantId_riskLevel_updatedAt_idx" ON "SkuRiskSnapshot"("tenantId", "riskLevel", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SkuRiskSnapshot_tenantId_sku_locationId_key" ON "SkuRiskSnapshot"("tenantId", "sku", "locationId");

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDeliveryLog" ADD CONSTRAINT "AlertDeliveryLog_driftEventId_fkey" FOREIGN KEY ("driftEventId") REFERENCES "DriftEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
