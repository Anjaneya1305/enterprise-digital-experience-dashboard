import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  PLATFORM_ID,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { forkJoin, interval, of, Subscription } from 'rxjs';
import { startWith, switchMap, catchError, filter } from 'rxjs/operators';
import {
  ApiService,
  HealthResponse,
  HealthResult,
  MetricsResponse,
  ApiRequestMetric,
  EndpointAnalytics,
  PerformanceTrend,
} from './services/api';
import { FormsModule } from '@angular/forms';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule,FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  private readonly apiService = inject(ApiService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cdr = inject(ChangeDetectorRef);

  liveness: HealthResponse | null = null;
  readiness: HealthResponse | null = null;
  metrics: MetricsResponse | null = null;
  requestHistory: ApiRequestMetric[] = [];
  autoRefreshEnabled = true;
  responseTimeTrend: { label: string; averageMs: number }[] = [];
  selectedRequest: ApiRequestMetric | null = null;
  historyError = false;
  searchTerm = '';
  methodFilter = 'ALL';
  statusFilter = 'ALL';

  get filteredRequestHistory(): ApiRequestMetric[] {
    const search = this.searchTerm.trim().toLowerCase();

    return this.requestHistory.filter((request) => {
      const matchesSearch =
        !search ||
        request.path.toLowerCase().includes(search) ||
        request.method.toLowerCase().includes(search) ||
        String(request.statusCode).includes(search);

      const matchesMethod =
        this.methodFilter === 'ALL' ||
        request.method === this.methodFilter;

      const matchesStatus =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'FAILED' && request.statusCode >= 400) ||
        (this.statusFilter === 'SUCCESS' && request.statusCode < 400);

      return matchesSearch && matchesMethod && matchesStatus;
    });
  }
  readonly slowRequestThresholdMs = 200;

get slowRequests(): ApiRequestMetric[] {
  return this.requestHistory.filter(
    (request) =>
      request.responseTimeMs >= this.slowRequestThresholdMs,
  );
}

get slowRequestCount(): number {
  return this.slowRequests.length;
}
get averageResponseTimeMs(): number {
  if (this.requestHistory.length === 0) {
    return 0;
  }

  const totalResponseTime = this.requestHistory.reduce(
    (total, request) => total + request.responseTimeMs,
    0,
  );

  return Math.round(totalResponseTime / this.requestHistory.length);
}


  get statusCodeAnalytics(): {
    label: string;
    count: number;
    percent: number;
    description: string;
  }[] {
    const groups = [
      { label: "2xx", description: "Successful responses", min: 200, max: 299 },
      { label: "3xx", description: "Redirect responses", min: 300, max: 399 },
      { label: "4xx", description: "Client errors", min: 400, max: 499 },
      { label: "5xx", description: "Server errors", min: 500, max: 599 }
    ];

    const total = this.requestHistory.length;

    return groups.map(group => {
      const count = this.requestHistory.filter(
        request =>
          request.statusCode >= group.min &&
          request.statusCode <= group.max
      ).length;

      return {
        label: group.label,
        description: group.description,
        count,
        percent: total ? (count / total) * 100 : 0
      };
    });
  }

  get responseTimeChartData(): {
    id: number;
    path: string;
    method: string;
    responseTimeMs: number;
    barWidth: number;
    slow: boolean;
  }[] {
    const recent = this.requestHistory.slice(-8);
    const maxTime = Math.max(
      1,
      ...recent.map(request => request.responseTimeMs)
    );

    return recent.map((request, index) => ({
      id: request.id ?? index,
      path: request.path,
      method: request.method,
      responseTimeMs: request.responseTimeMs,
      barWidth: Math.max(3, (request.responseTimeMs / maxTime) * 100),
      slow: this.isSlowRequest(request)
    }));
  }

isSlowRequest(request: ApiRequestMetric): boolean {
  return request.responseTimeMs >= this.slowRequestThresholdMs;
}
  selectRequest(request: ApiRequestMetric): void {
  this.selectedRequest = request;
}

closeRequestDetails(): void {
  this.selectedRequest = null;
}

  livenessTime: number | null = null;
  readinessTime: number | null = null;

  livenessHistory: number[] = [];
  readinessHistory: number[] = [];

  livenessError = false;
  readinessError = false;
  metricsError = false;
  loading = true;
  refreshing = false;
  lastChecked: Date | null = null;

  private livenessSubscription?: Subscription;
  private readinessSubscription?: Subscription;
  private metricsSubscription?: Subscription;
  private historySubscription?: Subscription;
  private analyticsSubscription?: Subscription;

  persistentEndpointAnalytics: EndpointAnalytics[] = [];
  persistentPerformanceTrends: PerformanceTrend[] = [];
  persistentErrors: ApiRequestMetric[] = [];
  persistentSlowRequestRecords: ApiRequestMetric[] = [];
  persistentAnalyticsError = false;

  trendBarWidth(value: number | string): number {
    const maximum = Math.max(
      1,
      ...this.persistentPerformanceTrends.map(
        item => Number(item.averageResponseTimeMs) || 0,
      ),
    );
    return Math.max(2, (Number(value) / maximum) * 100);
  }

  loadPersistentAnalytics(): void {
    this.analyticsSubscription?.unsubscribe();

    this.analyticsSubscription = interval(15000)
      .pipe(
        startWith(0),
        filter(() => this.autoRefreshEnabled),
        switchMap(() =>
          forkJoin({
            endpoints: this.apiService.getEndpointAnalytics(),
            trends: this.apiService.getPerformanceTrends(24),
            errors: this.apiService.getRecentErrors(10),
            slowRequests: this.apiService.getSlowRequests(this.slowRequestThresholdMs, 10),
          }).pipe(
            catchError(error => {
              console.error('Persistent analytics request failed:', error);
              return of(null);
            }),
          ),
        ),
      )
      .subscribe(result => {
        if (result) {
          this.persistentEndpointAnalytics = result.endpoints;
          this.persistentPerformanceTrends = result.trends;
          this.persistentErrors = result.errors;
          this.persistentSlowRequestRecords = result.slowRequests;
          this.persistentAnalyticsError = false;
        } else {
          this.persistentAnalyticsError = true;
        }
        this.cdr.detectChanges();
      });
  }


  toggleAutoRefresh(): void {
    this.autoRefreshEnabled = !this.autoRefreshEnabled;
  }

  recordPerformanceTrend(): void {
    if (this.requestHistory.length === 0) return;

    const averageMs = Math.round(
      this.requestHistory.reduce(
        (sum, request) => sum + request.responseTimeMs, 0
      ) / this.requestHistory.length
    );

    this.responseTimeTrend = [
      ...this.responseTimeTrend,
      {
        label: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        }),
        averageMs
      }
    ].slice(-12);
  }

  get performanceTrendChartData(): {
    label: string;
    averageMs: number;
    barWidth: number;
  }[] {
    const maximum = Math.max(
      1,
      ...this.responseTimeTrend.map(point => point.averageMs)
    );

    return this.responseTimeTrend.map(point => ({
      ...point,
      barWidth: Math.max(3, point.averageMs / maximum * 100)
    }));
  }

  get endpointPerformanceRanking(): {
    method: string;
    path: string;
    count: number;
    averageMs: number;
    failures: number;
  }[] {
    const grouped = new Map<string, ApiRequestMetric[]>();

    for (const request of this.requestHistory) {
      const key = request.method + ' ' + request.path;
      const entries = grouped.get(key) ?? [];
      entries.push(request);
      grouped.set(key, entries);
    }

    return Array.from(grouped.values())
      .map(entries => ({
        method: entries[0].method,
        path: entries[0].path,
        count: entries.length,
        averageMs: Math.round(
          entries.reduce((sum, item) => sum + item.responseTimeMs, 0)
          / entries.length
        ),
        failures: entries.filter(item => item.statusCode >= 400).length
      }))
      .sort((a, b) => b.averageMs - a.averageMs)
      .slice(0, 5);
  }

  get failedRequestsHistory(): ApiRequestMetric[] {
    return this.requestHistory
      .filter(request => request.statusCode >= 400)
      .slice(0, 8);
  }

  exportRequestHistoryCsv(): void {
    const columns = [
      'ID', 'Method', 'Endpoint', 'Status Code',
      'Response Time (ms)', 'Created At'
    ];

    const escapeCsv = (value: unknown): string =>
      '"' + String(value ?? '').replace(/"/g, '""') + '"';

    const rows = this.requestHistory.map(request => [
      request.id,
      request.method,
      request.path,
      request.statusCode,
      request.responseTimeMs,
      request.createdAt
    ]);

    const csv = [columns, ...rows]
      .map(row => row.map(escapeCsv).join(','))
      .join('\r\n');

    const blob = new Blob(['\uFEFF', csv], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'api-request-history.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.loadPersistentAnalytics();

    this.livenessSubscription = interval(5000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.apiService.getLiveness().pipe(
            catchError((error) => {
              console.error('Liveness check failed:', error);
              return of(null);
            }),
          ),
        ),
      )
      .subscribe((result) => {
        this.updateLiveness(result);
        this.loading = false;
        this.refreshing = false;
        this.lastChecked = new Date();
        this.cdr.detectChanges();
      });

    this.readinessSubscription = interval(5000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.apiService.getReadiness().pipe(
            catchError((error) => {
              console.error('Readiness check failed:', error);
              return of(null);
            }),
          ),
        ),
      )
      .subscribe((result) => {
        this.updateReadiness(result);
        this.cdr.detectChanges();
      });

    this.historySubscription = interval(5000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.apiService.getRequestHistory(20).pipe(
            catchError((error) => {
              console.error('Request history failed:', error);
              return of(null);
            }),
          ),
        ),
      )
      .subscribe((result) => {
        this.requestHistory = result ?? [];
        this.recordPerformanceTrend();
        this.historyError = result === null;
        this.cdr.detectChanges();
      });

    this.metricsSubscription = interval(5000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.apiService.getMetrics().pipe(
            catchError((error) => {
              console.error('Metrics request failed:', error);
              return of(null);
            }),
          ),
        ),
      )
      .subscribe((result) => {
        this.updateMetrics(result);
        this.cdr.detectChanges();
      });
  }

  refreshNow(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.refreshing = true;

    this.apiService.getLiveness()
      .pipe(
        catchError((error) => {
          console.error('Manual liveness check failed:', error);
          return of(null);
        }),
      )
      .subscribe((result) => {
        this.updateLiveness(result);
        this.lastChecked = new Date();
        this.refreshing = false;
        this.cdr.detectChanges();
      });

    this.apiService.getReadiness()
      .pipe(
        catchError((error) => {
          console.error('Manual readiness check failed:', error);
          return of(null);
        }),
      )
      .subscribe((result) => {
        this.updateReadiness(result);
        this.cdr.detectChanges();
      });

    this.apiService.getRequestHistory(20)
      .pipe(
        catchError((error) => {
          console.error('Manual history request failed:', error);
          return of(null);
        }),
      )
      .subscribe((result) => {
        this.requestHistory = result ?? [];
        this.recordPerformanceTrend();
        this.historyError = result === null;
        this.cdr.detectChanges();
      });

    this.apiService.getMetrics()
      .pipe(
        catchError((error) => {
          console.error('Manual metrics request failed:', error);
          return of(null);
        }),
      )
      .subscribe((result) => {
        this.updateMetrics(result);
        this.cdr.detectChanges();
      });
  }

  private updateLiveness(result: HealthResult | null): void {
    this.liveness = result?.data ?? null;
    this.livenessTime = result?.responseTime ?? null;
    this.livenessError = result === null;

    if (result) {
      this.livenessHistory = [
        ...this.livenessHistory,
        result.responseTime,
      ].slice(-12);
    }
  }

  private updateReadiness(result: HealthResult | null): void {
    this.readiness = result?.data ?? null;
    this.readinessTime = result?.responseTime ?? null;
    this.readinessError = result === null;

    if (result) {
      this.readinessHistory = [
        ...this.readinessHistory,
        result.responseTime,
      ].slice(-12);
    }
  }

  private updateMetrics(result: MetricsResponse | null): void {
    this.metrics = result;
    this.metricsError = result === null;
  }

  getBarHeight(value: number, history: number[]): number {
    const maximum = Math.max(...history, 1);
    return Math.max(8, Math.round((value / maximum) * 100));
  }

  ngOnDestroy(): void {
    this.livenessSubscription?.unsubscribe();
    this.readinessSubscription?.unsubscribe();
    this.metricsSubscription?.unsubscribe();
    this.historySubscription?.unsubscribe();
  }
}
