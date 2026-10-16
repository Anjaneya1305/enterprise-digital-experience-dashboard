import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ApiRequestMetric } from './entities/api-request-metric.entity';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    @InjectRepository(ApiRequestMetric)
    private readonly metricRepository: Repository<ApiRequestMetric>,
  ) {}

  recordRequest(
    statusCode: number,
    method = 'UNKNOWN',
    path = '/',
    responseTimeMs = 0,
  ): void {
    void this.metricRepository.save({
      method,
      path,
      statusCode,
      responseTimeMs,
    }).catch((error: unknown) => {
      this.logger.error(
        'Failed to persist API request metric',
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  async getMetrics() {
    const result = await this.metricRepository
      .createQueryBuilder('metric')
      .select('COUNT(*)', 'total')
      .addSelect(
        'COUNT(*) FILTER (WHERE metric.statusCode >= 400)',
        'failed',
      )
      .getRawOne<{ total: string; failed: string }>();

    const total = Number(result?.total ?? 0);
    const failed = Number(result?.failed ?? 0);
    const successful = total - failed;

    return {
      totalRequests: total,
      successfulRequests: successful,
      failedRequests: failed,
      successRatePercent:
        total === 0 ? 100 : Number(((successful / total) * 100).toFixed(2)),
      errorRatePercent:
        total === 0 ? 0 : Number(((failed / total) * 100).toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }

  async getEndpointAnalytics() {
    return this.metricRepository
      .createQueryBuilder('metric')
      .select('metric.method', 'method')
      .addSelect('metric.path', 'path')
      .addSelect('COUNT(*)', 'totalRequests')
      .addSelect(
        'ROUND(AVG(metric.responseTimeMs)::numeric, 2)',
        'averageResponseTimeMs',
      )
      .addSelect(
        'MAX(metric.responseTimeMs)',
        'maxResponseTimeMs',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE metric.statusCode >= 400)',
        'failedRequests',
      )
      .addSelect(
        "ROUND((COUNT(*) FILTER (WHERE metric.statusCode >= 400) * 100.0 / NULLIF(COUNT(*), 0))::numeric, 2)",
        'errorRatePercent',
      )
      .groupBy('metric.method')
      .addGroupBy('metric.path')
      .orderBy('COUNT(*)', 'DESC')
      .limit(50)
      .getRawMany();
  }

  async getPerformanceTrends(hours = 24) {
    const safeHours = Math.min(Math.max(hours, 1), 168);

    return this.metricRepository
      .createQueryBuilder('metric')
      .select(
        "date_trunc('hour', metric.createdAt)",
        'time',
      )
      .addSelect('COUNT(*)', 'totalRequests')
      .addSelect(
        'ROUND(AVG(metric.responseTimeMs)::numeric, 2)',
        'averageResponseTimeMs',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE metric.statusCode >= 400)',
        'failedRequests',
      )
      .where(
        "metric.createdAt >= NOW() - (:hours * INTERVAL '1 hour')",
        { hours: safeHours },
      )
      .groupBy("date_trunc('hour', metric.createdAt)")
      .orderBy('time', 'ASC')
      .getRawMany();
  }

  async getRecentErrors(limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    return this.metricRepository.find({
      where: { statusCode: MoreThanOrEqual(400) },
      order: { createdAt: 'DESC' },
      take: safeLimit,
      select: {
        id: true,
        method: true,
        path: true,
        statusCode: true,
        responseTimeMs: true,
        createdAt: true,
      },
    });
  }

  private failedStatusCodeCondition() {
    const { MoreThanOrEqual } = require('typeorm');
    return MoreThanOrEqual(400);
  }

  async getRecentHistory(limit = 20) {
    return this.metricRepository.find({
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        method: true,
        path: true,
        statusCode: true,
        responseTimeMs: true,
        createdAt: true,
      },
    });
  }

  async getSlowRequests(thresholdMs = 200, limit = 10) {
    return this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.responseTimeMs > :thresholdMs', { thresholdMs })
      .orderBy('metric.responseTimeMs', 'DESC')
      .addOrderBy('metric.createdAt', 'DESC')
      .take(Math.min(Math.max(limit, 1), 100))
      .getMany();
  }
}
