import { Controller, Get, Query } from "@nestjs/common";
import { HybridMetricsQueryDto } from "./dto/hybrid-metrics-query.dto";
import { HybridMetricsService } from "./hybrid-metrics.service";

@Controller("metrics")
export class HybridMetricsController {
  constructor(private readonly metricsService: HybridMetricsService) {}

  @Get()
  metrics(@Query() query: HybridMetricsQueryDto) {
    return this.metricsService.metrics(query);
  }
}
