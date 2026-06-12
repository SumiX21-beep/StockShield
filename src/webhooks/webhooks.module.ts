import { Module } from "@nestjs/common";
import { HybridModule } from "../hybrid/hybrid.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueuesModule } from "../queues/queues.module";
import { ShopifyWebhookVerifierService } from "./shopify-webhook-verifier.service";
import { ShopifyWebhooksController } from "./shopify-webhooks.controller";
import { ShopifyWebhooksService } from "./shopify-webhooks.service";

@Module({
  imports: [PrismaModule, QueuesModule, HybridModule],
  controllers: [ShopifyWebhooksController],
  providers: [ShopifyWebhooksService, ShopifyWebhookVerifierService],
})
export class WebhooksModule {}
