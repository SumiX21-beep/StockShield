import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { InternalAuthGuard } from "../auth/internal-auth.guard";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { TriggerScanDto } from "./dto/trigger-scan.dto";
import { ScansService } from "./scans.service";

@Controller(["scans", "v1/admin/scans"])
@UseGuards(InternalAuthGuard, TenantScopeGuard)
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post("trigger")
  trigger(@Body() body: TriggerScanDto) {
    return this.scansService.trigger(body);
  }
}
