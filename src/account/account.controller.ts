import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AuthenticatedRequest } from "../auth/auth.types";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { AccountService } from "./account.service";
import { UpdatePlanDto } from "./dto/update-plan.dto";

@Controller("v1/admin/account")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  overview(@Req() request: AuthenticatedRequest) {
    return this.accountService.overview(this.tenantId(request));
  }

  @Patch("plan")
  updatePlan(@Req() request: AuthenticatedRequest, @Body() body: UpdatePlanDto) {
    return this.accountService.updatePlan(this.tenantId(request), body.plan);
  }

  private tenantId(request: AuthenticatedRequest) {
    const tenantId = request.tenantScope?.tenantId ?? request.auth?.tenantId;
    if (!tenantId) {
      throw new Error("Tenant scope is required");
    }
    return tenantId;
  }
}
