import { Global, Module } from "@nestjs/common";
import { OmsReaderService } from "./oms-reader.service";

@Global()
@Module({
  providers: [OmsReaderService],
  exports: [OmsReaderService],
})
export class OmsModule {}
