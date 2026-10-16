import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

interface MetricRequest {
  url?: string;
  originalUrl?: string;
  method?: string;
}

interface MetricResponse {
  statusCode?: number;
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<MetricRequest>();
    const response = http.getResponse<MetricResponse>();

    const path = (request.originalUrl ?? request.url ?? '/').split('?')[0];

    if (path.endsWith('/metrics') || path.endsWith('/metrics/history')) {
      return next.handle();
    }

    const method = request.method ?? 'UNKNOWN';
    const startedAt = Date.now();
    let recorded = false;

    const record = (statusCode: number) => {
      if (recorded) return;
      recorded = true;

      this.metricsService.recordRequest(
        statusCode,
        method,
        path,
        Date.now() - startedAt,
      );
    };

    return next.handle().pipe(
      tap({
        complete: () => record(response.statusCode ?? 200),
        error: (error: unknown) => {
          const statusCode =
            error instanceof HttpException ? error.getStatus() : 500;
          record(statusCode);
        },
      }),
    );
  }
}
