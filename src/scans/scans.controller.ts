import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { InternalAuthGuard } from "../auth/internal-auth.guard";
import { TriggerScanDto } from "./dto/trigger-scan.dto";
import { ScansService } from "./scans.service";

@Controller("scans")
@UseGuards(InternalAuthGuard)
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post("trigger")
  trigger(@Body() body: TriggerScanDto) {
    return this.scansService.trigger(body);
  }
}
