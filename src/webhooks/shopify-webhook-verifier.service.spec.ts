import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { ShopifyWebhookVerifierService } from "./shopify-webhook-verifier.service";

const originalSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
const originalApiSecret = process.env.SHOPIFY_API_SECRET;

describe("ShopifyWebhookVerifierService", () => {
  afterEach(() => {
    process.env.SHOPIFY_WEBHOOK_SECRET = originalSecret;
    process.env.SHOPIFY_API_SECRET = originalApiSecret;
  });

  it("accepts a valid Shopify HMAC for the raw body", () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = "webhook-secret";
    delete process.env.SHOPIFY_API_SECRET;
    const rawBody = Buffer.from(JSON.stringify({ inventory_item_id: 123, location_id: 456 }));
    const hmac = createHmac("sha256", "webhook-secret").update(rawBody).digest("base64");

    const verifier = new ShopifyWebhookVerifierService();

    assert.equal(verifier.verify(rawBody, hmac), true);
  });

  it("rejects a mismatched HMAC", () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = "webhook-secret";
    const rawBody = Buffer.from(JSON.stringify({ ok: true }));
    const hmac = createHmac("sha256", "different-secret").update(rawBody).digest("base64");

    const verifier = new ShopifyWebhookVerifierService();

    assert.equal(verifier.verify(rawBody, hmac), false);
  });

  it("rejects requests when the secret, body, or header is missing", () => {
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
    delete process.env.SHOPIFY_API_SECRET;
    const verifier = new ShopifyWebhookVerifierService();

    assert.equal(verifier.verify(Buffer.from("{}"), "anything"), false);
    process.env.SHOPIFY_WEBHOOK_SECRET = "webhook-secret";
    assert.equal(verifier.verify(undefined, "anything"), false);
    assert.equal(verifier.verify(Buffer.from("{}"), undefined), false);
  });
});
