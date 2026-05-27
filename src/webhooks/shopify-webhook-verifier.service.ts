import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";

@Injectable()
export class ShopifyWebhookVerifierService {
  verify(rawBody: Buffer | undefined, hmacHeader: string | string[] | undefined): boolean {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET ?? process.env.SHOPIFY_API_SECRET;
    const hmac = Array.isArray(hmacHeader) ? hmacHeader[0] : hmacHeader;

    if (!secret || !rawBody || !hmac) {
      return false;
    }

    const computed = createHmac("sha256", secret).update(rawBody).digest("base64");
    const providedBuffer = Buffer.from(hmac.trim(), "utf8");
    const computedBuffer = Buffer.from(computed, "utf8");

    if (providedBuffer.length !== computedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, computedBuffer);
  }
}
