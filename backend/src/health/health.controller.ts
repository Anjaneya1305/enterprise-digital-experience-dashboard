import { Controller, Get, HttpCode } from '@nestjs/common';

@Controller('api/v1/health')
export class HealthController {
  @Get('live')
  @HttpCode(200)
  getLiveness() {
    return {
      status: 'ok',
      check: 'live',
      service: 'enterprise-dashboard-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HttpCode(200)
  getReadiness() {
    return {
      status: 'ok',
      check: 'ready',
      service: 'enterprise-dashboard-api',
      timestamp: new Date().toISOString(),
    };
  }
}