import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface HealthResponse {
  status: string;
  check: string;
  service: string;
  timestamp: string;
  uptime: number;
}

export interface HealthResult {
  data: HealthResponse;
  responseTime: number;
}

export interface MetricsResponse {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRatePercent: number;
  errorRatePercent: number;
  timestamp: string;
}

export interface ApiRequestMetric {
  id: number;
  method: string;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  createdAt: string;
}

export interface EndpointAnalytics {
  method: string;
  path: string;
  totalRequests: number | string;
  averageResponseTimeMs: number | string;
  maxResponseTimeMs: number | string;
  failedRequests: number | string;
  errorRatePercent: number | string;
}

export interface PerformanceTrend {
  time: string;
  totalRequests: number | string;
  averageResponseTimeMs: number | string;
  failedRequests: number | string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);

  getLiveness(): Observable<HealthResult> {
    const start = performance.now();

    return this.http.get<HealthResponse>('/api/v1/health/live').pipe(
      map((data) => ({
        data,
        responseTime: Math.round(performance.now() - start),
      })),
    );
  }

  getReadiness(): Observable<HealthResult> {
    const start = performance.now();

    return this.http.get<HealthResponse>('/api/v1/health/ready').pipe(
      map((data) => ({
        data,
        responseTime: Math.round(performance.now() - start),
      })),
    );
  }

  getMetrics(): Observable<MetricsResponse> {
    return this.http.get<MetricsResponse>('/api/v1/metrics');
  }

  getEndpointAnalytics(): Observable<EndpointAnalytics[]> {
    return this.http.get<EndpointAnalytics[]>(
      '/api/v1/metrics/analytics/endpoints',
    );
  }

  getPerformanceTrends(hours = 24): Observable<PerformanceTrend[]> {
    return this.http.get<PerformanceTrend[]>(
      `/api/v1/metrics/analytics/trends?hours=${hours}`,
    );
  }

  getRecentErrors(limit = 10): Observable<ApiRequestMetric[]> {
    return this.http.get<ApiRequestMetric[]>(
      `/api/v1/metrics/analytics/errors?limit=${limit}`,
    );
  }

  getSlowRequests(thresholdMs = 200, limit = 10): Observable<ApiRequestMetric[]> {
    return this.http.get<ApiRequestMetric[]>(
      `/api/v1/metrics/analytics/slow-requests?thresholdMs=${thresholdMs}&limit=${limit}`,
    );
  }

  getRequestHistory(limit = 20): Observable<ApiRequestMetric[]> {
    return this.http.get<ApiRequestMetric[]>(
      `/api/v1/metrics/history?limit=${limit}`,
    );
  }
}
