import { Body, Controller, Post } from "@nestjs/common";
import { TriggerScanDto } from "./dto/trigger-scan.dto";
import { ScansService } from "./scans.service";

@Controller("scans")
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post("trigger")
  trigger(@Body() body: TriggerScanDto) {
    return this.scansService.trigger(body);
  }
}
