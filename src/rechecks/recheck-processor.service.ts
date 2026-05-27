import { Injectable } from "@nestjs/common";
import { RecheckStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ScanProcessorService } from "../scans/scan-processor.service";
import { RecheckJobPayload, RecheckJobResult } from "./recheck-job.types";

@Injectable()
export class RecheckProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scanProcessor: ScanProcessorService,
  ) {}

  async process(payload: RecheckJobPayload): Promise<RecheckJobResult> {
    const result = await this.scanProcessor.processTargetedRecheck({
      tenantId: payload.tenantId,
      sku: payload.sku,
      locationId: payload.locationId,
      sourceEventId: payload.sourceEventId,
    });

    await this.prisma.webhookRecheckEvent.update({
      where: { id: payload.webhookRecheckEventId },
      data: {
        status: result.failedManual > 0 ? RecheckStatus.FAILED : RecheckStatus.PROCESSED,
      },
    });

    return {
      webhookRecheckEventId: payload.webhookRecheckEventId,
      tenantId: result.tenantId,
      sku: result.sku,
      locationId: result.locationId,
      detectedDrifts: result.detectedDrifts,
      resolvedDuringScan: result.resolvedDuringScan,
      failedManual: result.failedManual,
    };
  }
}
