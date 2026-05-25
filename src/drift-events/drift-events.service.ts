import { Injectable, NotFoundException } from "@nestjs/common";
import { DriftStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDriftEventDto } from "./dto/create-drift-event.dto";
import { ListDriftEventsQueryDto } from "./dto/list-drift-events.query";

@Injectable()
export class DriftEventsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateDriftEventDto) {
    return this.prisma.driftEvent.create({
      data: {
        tenantId: input.tenantId,
        sku: input.sku,
        locationId: input.locationId,
        omsAvailable: input.omsAvailable,
        channelAvailable: input.channelAvailable,
        drift: input.omsAvailable - input.channelAvailable,
        status: input.status ?? DriftStatus.DETECTED,
        reason: input.reason,
      },
    });
  }

  async list(query: ListDriftEventsQueryDto) {
    const where: Prisma.DriftEventWhereInput = {
      tenantId: query.tenantId,
      sku: query.sku,
      status: query.status,
    };
    const skip = (query.page - 1) * query.limit;
    const take = query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.driftEvent.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.driftEvent.count({ where }),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total,
      items,
    };
  }

  async findById(id: string) {
    const driftEvent = await this.prisma.driftEvent.findUnique({
      where: { id },
    });

    if (!driftEvent) {
      throw new NotFoundException(`Drift event ${id} was not found`);
    }

    return driftEvent;
  }

  async retry(id: string) {
    await this.findById(id);

    return this.prisma.driftEvent.update({
      where: { id },
      data: {
        status: DriftStatus.RETRYING,
        reason: "Manual retry requested",
      },
    });
  }
}
