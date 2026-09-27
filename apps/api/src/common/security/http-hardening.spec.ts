import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  apiRateLimitConfigurationFromEnvironment,
  configureHttpSecurity,
  swaggerEnabledFromEnvironment,
} from './http-hardening.js';

@Controller('health')
class HardeningTestController {
  @Get()
  health(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [HardeningTestController] })
class HardeningTestModule {}

describe('HTTP hardening', () => {
  it('adds secure headers and enforces the configured IP limit', async () => {
    const app = await NestFactory.create(HardeningTestModule, {
      logger: false,
    });
    configureHttpSecurity(app, {
      NODE_ENV: 'test',
      API_RATE_LIMIT_WINDOW_MS: '60000',
      API_RATE_LIMIT_MAX: '1',
    });
    await app.init();

    try {
      const first = await request(app.getHttpServer()).get('/health');
      const second = await request(app.getHttpServer()).get('/health');

      expect(first.status).toBe(200);
      expect(first.headers['x-content-type-options']).toBe('nosniff');
      expect(first.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(second.status).toBe(429);
    } finally {
      await app.close();
    }
  });

  it('requires explicit rate-limit settings for deployed environments', () => {
    expect(() =>
      apiRateLimitConfigurationFromEnvironment({ NODE_ENV: 'production' }),
    ).toThrow(/Missing API_RATE_LIMIT_WINDOW_MS and API_RATE_LIMIT_MAX/);
    expect(() =>
      apiRateLimitConfigurationFromEnvironment({
        NODE_ENV: 'staging',
        API_RATE_LIMIT_WINDOW_MS: '60000',
      }),
    ).toThrow('Missing API_RATE_LIMIT_MAX');
  });

  it('keeps Swagger disabled unless explicitly enabled', () => {
    expect(swaggerEnabledFromEnvironment({ NODE_ENV: 'development' })).toBe(
      false,
    );
    expect(
      swaggerEnabledFromEnvironment({
        NODE_ENV: 'development',
        API_SWAGGER_ENABLED: 'true',
      }),
    ).toBe(true);
    expect(() =>
      swaggerEnabledFromEnvironment({
        NODE_ENV: 'production',
        API_SWAGGER_ENABLED: 'true',
      }),
    ).toThrow('Invalid API_SWAGGER_ENABLED');
  });
});
