import { Global, Module } from "@nestjs/common";
import { TokenCryptoModule } from "../crypto/token-crypto.module";
import { ShopifyInventoryService } from "./shopify-inventory.service";

@Global()
@Module({
  imports: [TokenCryptoModule],
  providers: [ShopifyInventoryService],
  exports: [ShopifyInventoryService],
})
export class ShopifyModule {}
