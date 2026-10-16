import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module';
import { MetricsService } from './metrics/metrics.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  app.setGlobalPrefix('api/v1');
  app.enableCors();

  const metricsService = app.get(
    MetricsService,
  );

  app.use((req: any, res: any, next: any) => {
    const startedAt = Date.now();

    res.on('finish', () => {
      if (res.statusCode === 404) {
        const path = (req.originalUrl ?? req.url ?? '/').split('?')[0];
        const responseTimeMs = Date.now() - startedAt;

        metricsService.recordRequest(
          404,
          req.method ?? 'UNKNOWN',
          path,
          responseTimeMs,
        );
      }
    });

    next();
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
