import { Injectable } from "@nestjs/common";
import { TenantChannelConfig, TenantSkuLocationMap } from "@prisma/client";
import { TokenCryptoService } from "../crypto/token-crypto.service";

type ShopifyInventoryLevelsResponse = {
  inventory_levels?: Array<{
    inventory_item_id?: number | string;
    location_id?: number | string;
    available?: number;
  }>;
};

type ShopifyInventorySetResponse = {
  inventory_level?: {
    inventory_item_id?: number | string;
    location_id?: number | string;
    available?: number;
  };
};

@Injectable()
export class ShopifyInventoryService {
  constructor(private readonly tokenCrypto: TokenCryptoService) {}

  async getAvailableQuantity(config: TenantChannelConfig, mapping: TenantSkuLocationMap): Promise<number> {
    const apiVersion = config.apiVersion ?? (process.env.SHOPIFY_API_VERSION ?? "2025-10");
    const url = new URL(`${this.shopBaseUrl(config.shopDomain)}/admin/api/${apiVersion}/inventory_levels.json`);
    url.searchParams.set("inventory_item_ids", mapping.shopifyInventoryItemId);
    url.searchParams.set("location_ids", mapping.shopifyLocationId);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": this.resolveAccessToken(config.encryptedAccessToken),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Shopify inventory read failed (${response.status})`);
    }

    const body = (await response.json()) as ShopifyInventoryLevelsResponse;
    const level = body.inventory_levels?.[0];
    if (!level || typeof level.available !== "number") {
      throw new Error("Shopify inventory level not found");
    }

    return level.available;
  }

  async setAvailableQuantity(
    config: TenantChannelConfig,
    mapping: TenantSkuLocationMap,
    available: number,
  ): Promise<ShopifyInventorySetResponse> {
    const apiVersion = config.apiVersion ?? (process.env.SHOPIFY_API_VERSION ?? "2025-10");
    const response = await fetch(`${this.shopBaseUrl(config.shopDomain)}/admin/api/${apiVersion}/inventory_levels/set.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": this.resolveAccessToken(config.encryptedAccessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inventory_item_id: this.shopifyRestId(mapping.shopifyInventoryItemId),
        location_id: this.shopifyRestId(mapping.shopifyLocationId),
        available,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shopify inventory set failed (${response.status}): ${body.slice(0, 300)}`);
    }

    return (await response.json()) as ShopifyInventorySetResponse;
  }

  private resolveAccessToken(token: string): string {
    if (!token) {
      throw new Error("Missing Shopify access token");
    }

    if (!token.startsWith("v1:")) {
      return token;
    }

    return this.tokenCrypto.decrypt(token);
  }

  private shopBaseUrl(shopDomain: string) {
    const trimmed = shopDomain.trim().replace(/\/+$/, "");
    if (trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("http://")) {
      return `https://${trimmed.slice("http://".length)}`;
    }
    return `https://${trimmed}`;
  }

  private shopifyRestId(value: string) {
    if (!/^\d+$/.test(value)) {
      throw new Error(`Invalid Shopify REST ID "${value}"`);
    }

    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value;
  }
}
