import { Controller, Get, HttpCode } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  @HttpCode(200)
  getLiveness() {
    return {
      status: 'ok',
      check: 'live',
      service: 'enterprise-dashboard-api',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
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
      uptime: Math.floor(process.uptime()),
    };
  }
}
