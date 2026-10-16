import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  getMetrics() {
    return this.metricsService.getMetrics();
  }

  @Get('analytics/endpoints')
  getEndpointAnalytics() {
    return this.metricsService.getEndpointAnalytics();
  }

  @Get('analytics/trends')
  getPerformanceTrends(
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
  ) {
    return this.metricsService.getPerformanceTrends(hours);
  }

  @Get('analytics/errors')
  getRecentErrors(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.metricsService.getRecentErrors(limit);
  }

  @Get('analytics/slow-requests')
  getSlowRequests(
    @Query('thresholdMs', new DefaultValuePipe(200), ParseIntPipe)
    thresholdMs: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe)
    limit: number,
  ) {
    return this.metricsService.getSlowRequests(thresholdMs, limit);
  }

  @Get('history')
  getRecentHistory(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.metricsService.getRecentHistory(limit);
  }
}
