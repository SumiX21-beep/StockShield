import { Body, Controller, Headers, Post, Req } from "@nestjs/common";
import { ShopifyInventoryLevelsUpdatePayload, ShopifyWebhooksService } from "./shopify-webhooks.service";

type RequestWithRawBody = {
  rawBody?: Buffer;
};

@Controller("webhooks/shopify")
export class ShopifyWebhooksController {
  constructor(private readonly shopifyWebhooksService: ShopifyWebhooksService) {}

  @Post("inventory-levels-update")
  inventoryLevelsUpdate(
    @Req() request: RequestWithRawBody,
    @Body() body: ShopifyInventoryLevelsUpdatePayload,
    @Headers("x-shopify-hmac-sha256") hmac: string | string[] | undefined,
    @Headers("x-shopify-shop-domain") shopDomain: string | string[] | undefined,
    @Headers("x-shopify-topic") topic: string | string[] | undefined,
    @Headers("x-shopify-webhook-id") webhookId: string | string[] | undefined,
    @Headers("x-shopify-event-id") eventId: string | string[] | undefined,
  ) {
    return this.shopifyWebhooksService.handleInventoryLevelsUpdate({
      rawBody: request.rawBody,
      body,
      headers: {
        hmac,
        shopDomain,
        topic,
        webhookId,
        eventId,
      },
    });
  }
}
