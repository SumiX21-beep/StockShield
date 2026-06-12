import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from "crypto";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR DATABASE_URL is required to seed demo data.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const tenantId = process.env.STOCKSHIELD_DEMO_TENANT_ID ?? "store_1";
const email = process.env.STOCKSHIELD_DEMO_EMAIL ?? "demo@stockshield.local";
const password = process.env.STOCKSHIELD_DEMO_PASSWORD ?? "StockShield@123";

try {
  await resetDemoData();
  await seedTenant();
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Demo Operator",
      passwordHash: hashPassword(password),
      role: "ADMIN",
      memberships: {
        create: {
          tenantId,
          role: "ADMIN",
        },
      },
    },
    update: {
      name: "Demo Operator",
      passwordHash: hashPassword(password),
      role: "ADMIN",
    },
  });

  await prisma.tenantMembership.upsert({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId,
      },
    },
    create: {
      userId: user.id,
      tenantId,
      role: "ADMIN",
    },
    update: {
      role: "ADMIN",
    },
  });

  await prisma.tenantChannelConfig.upsert({
    where: {
      tenantId_channel: {
        tenantId,
        channel: "SHOPIFY",
      },
    },
    create: {
      tenantId,
      channel: "SHOPIFY",
      shopDomain: "demo-stockshield.myshopify.com",
      encryptedAccessToken: encryptToken("shpat_demo_token"),
      apiVersion: process.env.SHOPIFY_API_VERSION ?? "2025-10",
    },
    update: {
      shopDomain: "demo-stockshield.myshopify.com",
      encryptedAccessToken: encryptToken("shpat_demo_token"),
      apiVersion: process.env.SHOPIFY_API_VERSION ?? "2025-10",
      status: "ACTIVE",
    },
  });

  await seedMappings();
  await seedInventoryCore();
  await seedDriftEvents();
  await seedRisks();
  await seedAlerts();

  console.log("OK StockShield demo data seeded");
  console.log(`Tenant: ${tenantId}`);
  console.log(`Login:  ${email}`);
  console.log(`Password: ${password}`);
} finally {
  await prisma.$disconnect();
}

async function seedTenant() {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.tenant.upsert({
    where: { id: tenantId },
    create: {
      id: tenantId,
      name: "StockShield Demo Store",
      status: "ACTIVE",
    },
    update: {
      name: "StockShield Demo Store",
      status: "ACTIVE",
    },
  });

  await prisma.tenantBillingSubscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      plan: "FREE",
      status: "TRIALING",
      monthlyEventLimit: 100,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    update: {
      plan: "FREE",
      status: "TRIALING",
      monthlyEventLimit: 100,
    },
  });
}

async function resetDemoData() {
  await prisma.alertDeliveryLog.deleteMany({ where: { tenantId } });
  await prisma.skuRiskSnapshot.deleteMany({ where: { tenantId } });
  await prisma.inventorySyncAttempt.deleteMany({ where: { tenantId } });
  await prisma.inventorySyncOutbox.deleteMany({ where: { tenantId } });
  await prisma.inventoryLedgerEntry.deleteMany({ where: { tenantId } });
  await prisma.stockReservation.deleteMany({ where: { tenantId } });
  await prisma.omsOrderLine.deleteMany({ where: { tenantId } });
  await prisma.omsOrder.deleteMany({ where: { tenantId } });
  await prisma.inventoryBalance.deleteMany({ where: { tenantId } });
  await prisma.sku.deleteMany({ where: { tenantId } });
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.warehouseLocation.deleteMany({ where: { tenantId } });
  await prisma.driftAttemptLog.deleteMany({
    where: {
      driftEvent: {
        tenantId,
      },
    },
  });
  await prisma.driftEvent.deleteMany({ where: { tenantId } });
}

async function seedMappings() {
  const mappings = [
    ["TSHIRT-BLK-M", "loc_mumbai", "7000001", "900001"],
    ["DENIM-32-BLUE", "loc_mumbai", "7000002", "900001"],
    ["SNEAKER-WHT-9", "loc_delhi", "7000003", "900002"],
    ["HOODIE-GRY-L", "loc_bengaluru", "7000004", "900003"],
  ];

  for (const [sku, omsLocationId, shopifyInventoryItemId, shopifyLocationId] of mappings) {
    await prisma.tenantSkuLocationMap.upsert({
      where: {
        tenantId_channel_sku_omsLocationId: {
          tenantId,
          channel: "SHOPIFY",
          sku,
          omsLocationId,
        },
      },
      create: {
        tenantId,
        channel: "SHOPIFY",
        sku,
        omsLocationId,
        shopifyInventoryItemId,
        shopifyLocationId,
      },
      update: {
        shopifyInventoryItemId,
        shopifyLocationId,
        isActive: true,
      },
    });
  }
}

async function seedDriftEvents() {
  const now = Date.now();
  const events = [
    {
      id: "demo-drift-open-1",
      sku: "TSHIRT-BLK-M",
      locationId: "loc_mumbai",
      omsAvailable: 100,
      channelAvailable: 95,
      status: "FIX_QUEUED",
      reason: "AUTO_FIX_QUEUED",
      createdAt: new Date(now - 8 * 60_000),
    },
    {
      id: "demo-drift-failed-1",
      sku: "DENIM-32-BLUE",
      locationId: "loc_mumbai",
      omsAvailable: 42,
      channelAvailable: 51,
      status: "FAILED_MANUAL",
      reason: "Shopify returned HTTP 429 after retry limit",
      createdAt: new Date(now - 40 * 60_000),
    },
    {
      id: "demo-drift-resolved-1",
      sku: "SNEAKER-WHT-9",
      locationId: "loc_delhi",
      omsAvailable: 18,
      channelAvailable: 18,
      status: "RESOLVED",
      reason: "AUTO_FIX_APPLIED",
      createdAt: new Date(now - 2 * 60 * 60_000),
    },
    {
      id: "demo-risk-1",
      sku: "HOODIE-GRY-L",
      locationId: "loc_bengaluru",
      omsAvailable: 76,
      channelAvailable: 69,
      status: "RESOLVED",
      reason: "AUTO_FIX_APPLIED",
      createdAt: new Date(now - 6 * 60 * 60_000),
    },
    {
      id: "demo-risk-2",
      sku: "HOODIE-GRY-L",
      locationId: "loc_bengaluru",
      omsAvailable: 75,
      channelAvailable: 70,
      status: "FAILED_MANUAL",
      reason: "Manual Shopify adjustment detected",
      createdAt: new Date(now - 3 * 60 * 60_000),
    },
    {
      id: "demo-risk-3",
      sku: "HOODIE-GRY-L",
      locationId: "loc_bengaluru",
      omsAvailable: 80,
      channelAvailable: 73,
      status: "IGNORED",
      reason: "Known warehouse cycle count",
      createdAt: new Date(now - 70 * 60_000),
    },
  ];

  for (const event of events) {
    await prisma.driftEvent.create({
      data: {
        ...event,
        tenantId,
        channel: "SHOPIFY",
        drift: event.omsAvailable - event.channelAvailable,
        updatedAt: new Date(event.createdAt.getTime() + 4 * 60_000),
      },
    });
    await seedAttempts(event.id, event.status);
  }
}

async function seedAttempts(driftEventId, status) {
  const attempts =
    status === "FAILED_MANUAL"
      ? [
          ["STARTED", null],
          ["FAILED", "Shopify Admin API rate limit persisted after retries"],
        ]
      : status === "RESOLVED"
        ? [
            ["STARTED", null],
            ["SUCCESS", null],
          ]
        : [["STARTED", null]];

  let attemptNumber = 1;
  for (const [attemptStatus, errorMessage] of attempts) {
    await prisma.driftAttemptLog.create({
      data: {
        driftEventId,
        attemptNumber,
        status: attemptStatus,
        targetQuantity: 100,
        requestPayload: {
          cause: "demo-seed",
        },
        responsePayload: attemptStatus === "SUCCESS" ? { inventory_level: { available: 100 } } : undefined,
        errorMessage,
      },
    });
    attemptNumber += 1;
  }
}

async function seedRisks() {
  await prisma.skuRiskSnapshot.createMany({
    data: [
      {
        tenantId,
        sku: "TSHIRT-BLK-M",
        locationId: "loc_mumbai",
        driftCount24h: 1,
        lastDriftAt: new Date(Date.now() - 8 * 60_000),
        riskLevel: "LOW",
      },
      {
        tenantId,
        sku: "DENIM-32-BLUE",
        locationId: "loc_mumbai",
        driftCount24h: 2,
        lastDriftAt: new Date(Date.now() - 40 * 60_000),
        riskLevel: "MEDIUM",
      },
      {
        tenantId,
        sku: "HOODIE-GRY-L",
        locationId: "loc_bengaluru",
        driftCount24h: 3,
        lastDriftAt: new Date(Date.now() - 70 * 60_000),
        riskLevel: "HIGH",
      },
    ],
  });
}

async function seedInventoryCore() {
  const products = [
    {
      title: "Black T-Shirt",
      sku: "TSHIRT-BLK-M",
      locationId: "loc_mumbai",
      locationName: "Mumbai Warehouse",
      physicalQuantity: 100,
      reservedQuantity: 5,
      safetyBuffer: 2,
      unitPriceCents: 2499,
    },
    {
      title: "Blue Denim",
      sku: "DENIM-32-BLUE",
      locationId: "loc_mumbai",
      locationName: "Mumbai Warehouse",
      physicalQuantity: 42,
      reservedQuantity: 0,
      safetyBuffer: 1,
      unitPriceCents: 3999,
    },
    {
      title: "White Sneaker",
      sku: "SNEAKER-WHT-9",
      locationId: "loc_delhi",
      locationName: "Delhi Fulfillment Hub",
      physicalQuantity: 18,
      reservedQuantity: 0,
      safetyBuffer: 0,
      unitPriceCents: 5999,
    },
    {
      title: "Grey Hoodie",
      sku: "HOODIE-GRY-L",
      locationId: "loc_bengaluru",
      locationName: "Bengaluru Warehouse",
      physicalQuantity: 80,
      reservedQuantity: 3,
      safetyBuffer: 1,
      unitPriceCents: 4499,
    },
  ];

  for (const item of products) {
    const product = await prisma.product.create({
      data: {
        tenantId,
        title: item.title,
      },
    });

    await prisma.sku.create({
      data: {
        tenantId,
        productId: product.id,
        sku: item.sku,
        title: item.title,
        safetyBuffer: item.safetyBuffer,
        unitPriceCents: item.unitPriceCents,
      },
    });

    await prisma.warehouseLocation.upsert({
      where: {
        tenantId_locationId: {
          tenantId,
          locationId: item.locationId,
        },
      },
      create: {
        tenantId,
        locationId: item.locationId,
        name: item.locationName,
      },
      update: {
        name: item.locationName,
        isActive: true,
      },
    });

    const sellableQuantity = Math.max(0, item.physicalQuantity - item.reservedQuantity - item.safetyBuffer);
    await prisma.inventoryBalance.create({
      data: {
        tenantId,
        sku: item.sku,
        locationId: item.locationId,
        physicalQuantity: item.physicalQuantity,
        reservedQuantity: item.reservedQuantity,
        safetyBuffer: item.safetyBuffer,
        sellableQuantity,
      },
    });

    await prisma.inventoryLedgerEntry.create({
      data: {
        tenantId,
        sku: item.sku,
        locationId: item.locationId,
        movementType: "STOCK_ADDED",
        physicalDelta: item.physicalQuantity,
        reservedDelta: 0,
        physicalQuantityAfter: item.physicalQuantity,
        reservedQuantityAfter: 0,
        sellableQuantityAfter: item.physicalQuantity - item.safetyBuffer,
        sourceType: "DEMO_SEED",
        reason: "Initial warehouse stock",
      },
    });

    if (item.reservedQuantity > 0) {
      await prisma.inventoryLedgerEntry.create({
        data: {
          tenantId,
          sku: item.sku,
          locationId: item.locationId,
          movementType: "ORDER_RESERVED",
          physicalDelta: 0,
          reservedDelta: item.reservedQuantity,
          physicalQuantityAfter: item.physicalQuantity,
          reservedQuantityAfter: item.reservedQuantity,
          sellableQuantityAfter: sellableQuantity,
          sourceType: "DEMO_SEED",
          reason: "Seeded active order reservation",
        },
      });
    }

    const syncJob = await prisma.inventorySyncOutbox.create({
      data: {
        tenantId,
        sku: item.sku,
        locationId: item.locationId,
        targetSellableQuantity: sellableQuantity,
        status: item.sku === "DENIM-32-BLUE" ? "FAILED" : "SUCCEEDED",
        attempts: item.sku === "DENIM-32-BLUE" ? 8 : 1,
        idempotencyKey: `demo-sync:${tenantId}:${item.sku}:${item.locationId}`,
        sourceType: "DEMO_SEED",
        sourceId: item.sku,
        lastError: item.sku === "DENIM-32-BLUE" ? "Shopify Admin API rate limit persisted after retries" : null,
        completedAt: item.sku === "DENIM-32-BLUE" ? null : new Date(),
      },
    });

    await prisma.inventorySyncAttempt.create({
      data: {
        syncJobId: syncJob.id,
        tenantId,
        status: item.sku === "DENIM-32-BLUE" ? "FAILED" : "SUCCESS",
        targetSellableQuantity: sellableQuantity,
        requestPayload: {
          sku: item.sku,
          locationId: item.locationId,
          targetSellableQuantity: sellableQuantity,
        },
        responsePayload: item.sku === "DENIM-32-BLUE" ? undefined : { inventory_level: { available: sellableQuantity } },
        errorMessage: item.sku === "DENIM-32-BLUE" ? "Shopify Admin API rate limit persisted after retries" : undefined,
      },
    });
  }

  const order = await prisma.omsOrder.create({
    data: {
      tenantId,
      externalOrderId: "shopify-demo-1001",
      status: "RESERVED",
    },
  });
  const line = await prisma.omsOrderLine.create({
    data: {
      orderId: order.id,
      tenantId,
      sku: "TSHIRT-BLK-M",
      locationId: "loc_mumbai",
      quantity: 5,
      unitPriceCents: 2499,
    },
  });
  await prisma.stockReservation.create({
    data: {
      tenantId,
      orderId: order.id,
      orderLineId: line.id,
      sku: "TSHIRT-BLK-M",
      locationId: "loc_mumbai",
      quantity: 5,
      status: "ACTIVE",
    },
  });
}

async function seedAlerts() {
  await prisma.alertDeliveryLog.createMany({
    data: [
      {
        tenantId,
        driftEventId: "demo-drift-open-1",
        status: "SENT",
        message: "Drift detected for SKU TSHIRT-BLK-M: OMS=100, Shopify=95, location=loc_mumbai",
      },
      {
        tenantId,
        driftEventId: "demo-drift-failed-1",
        status: "FAILED",
        message: "StockShield needs manual attention for SKU DENIM-32-BLUE",
        errorMessage: "Slack webhook returned HTTP 500",
      },
      {
        tenantId,
        status: "SENT",
        message: "High-risk SKU detected: HOODIE-GRY-L at loc_bengaluru drifted 3 times in the last 24h",
      },
    ],
  });
}

function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(value, salt, 120_000, 32, "sha256").toString("hex");
  return `pbkdf2:120000:${salt}:${digest}`;
}

function encryptToken(value) {
  const key = createHash("sha256")
    .update(process.env.STOCKSHIELD_ENCRYPTION_KEY ?? "stockshield-dev-key-change-me")
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}
