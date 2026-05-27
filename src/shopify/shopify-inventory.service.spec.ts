import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { ChannelType, TenantChannelConfig, TenantChannelStatus, TenantSkuLocationMap } from "@prisma/client";
import { TokenCryptoService } from "../crypto/token-crypto.service";
import { ShopifyInventoryService } from "./shopify-inventory.service";

const originalFetch = globalThis.fetch;

describe("ShopifyInventoryService", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reads Shopify available quantity using normalized shop domains", async () => {
    const requests: string[] = [];
    globalThis.fetch = async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ inventory_levels: [{ available: 12 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const service = new ShopifyInventoryService(new TokenCryptoService());
    const quantity = await service.getAvailableQuantity(
      config({ shopDomain: "demo.myshopify.com/" }),
      mapping({ shopifyInventoryItemId: "123", shopifyLocationId: "456" }),
    );

    assert.equal(quantity, 12);
    assert.equal(
      requests[0],
      "https://demo.myshopify.com/admin/api/2025-10/inventory_levels.json?inventory_item_ids=123&location_ids=456",
    );
  });

  it("sets inventory with large Shopify REST IDs without unsafe number coercion", async () => {
    let body: unknown;
    globalThis.fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ inventory_level: { available: 7 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const service = new ShopifyInventoryService(new TokenCryptoService());
    await service.setAvailableQuantity(
      config({ shopDomain: "https://demo.myshopify.com" }),
      mapping({
        shopifyInventoryItemId: "9007199254740993",
        shopifyLocationId: "456",
      }),
      7,
    );

    assert.deepEqual(body, {
      inventory_item_id: "9007199254740993",
      location_id: 456,
      available: 7,
    });
  });

  it("rejects non-numeric Shopify REST IDs before making set calls", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response("{}", { status: 200 });
    };

    const service = new ShopifyInventoryService(new TokenCryptoService());

    await assert.rejects(
      () => service.setAvailableQuantity(
        config({ shopDomain: "demo.myshopify.com" }),
        mapping({ shopifyInventoryItemId: "gid://shopify/InventoryItem/123", shopifyLocationId: "456" }),
        7,
      ),
      /Invalid Shopify REST ID/,
    );
    assert.equal(called, false);
  });
});

function config(input: Partial<TenantChannelConfig>): TenantChannelConfig {
  return {
    id: "config_1",
    tenantId: "tenant_1",
    channel: ChannelType.SHOPIFY,
    status: TenantChannelStatus.ACTIVE,
    shopDomain: "demo.myshopify.com",
    encryptedAccessToken: "plain-token",
    apiVersion: "2025-10",
    createdAt: new Date("2026-05-27T00:00:00Z"),
    updatedAt: new Date("2026-05-27T00:00:00Z"),
    ...input,
  };
}

function mapping(input: Partial<TenantSkuLocationMap>): TenantSkuLocationMap {
  return {
    id: "mapping_1",
    tenantId: "tenant_1",
    channel: ChannelType.SHOPIFY,
    sku: "SKU-123",
    omsLocationId: "loc_1",
    shopifyInventoryItemId: "123",
    shopifyLocationId: "456",
    isActive: true,
    createdAt: new Date("2026-05-27T00:00:00Z"),
    updatedAt: new Date("2026-05-27T00:00:00Z"),
    ...input,
  };
}
