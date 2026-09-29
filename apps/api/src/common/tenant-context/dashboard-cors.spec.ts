import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardCors } from './dashboard-cors.js';

@Controller('cors-probe')
class CorsProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

describe('dashboard CORS', () => {
  const applications: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((app) => app.close()));
  });

  async function createApplication(
    resolveCenterOrigin: (origin: string) => Promise<boolean>,
    reportResolverError = vi.fn(),
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CorsProbeController],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    app.enableCors(
      dashboardCors(
        ['https://auth.example.test'],
        resolveCenterOrigin,
        reportResolverError,
      ),
    );
    await app.init();
    applications.push(app);
    return { app, reportResolverError };
  }

  it.each([
    ['configured non-center origin', 'https://auth.example.test', false],
    ['active center origin', 'https://alpha.app.example.test', true],
  ])('allows %s through the production callback', async (_, origin, active) => {
    const resolveCenterOrigin = vi.fn().mockResolvedValue(active);
    const { app } = await createApplication(resolveCenterOrigin);

    const response = await request(app.getHttpServer())
      .options('/cors-probe')
      .set('origin', origin)
      .set('access-control-request-method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(resolveCenterOrigin).toHaveBeenCalledTimes(active ? 1 : 0);
  });

  it.each([
    ['disabled center origin', 'https://disabled.app.example.test'],
    ['unknown center origin', 'https://unknown.app.example.test'],
  ])('does not grant CORS to a %s', async (_, origin) => {
    const { app } = await createApplication(vi.fn().mockResolvedValue(false));

    const response = await request(app.getHttpServer())
      .get('/cors-probe')
      .set('origin', origin);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('fails unavailable without granting CORS when center resolution errors', async () => {
    const resolverError = new Error('database unavailable');
    const { app, reportResolverError } = await createApplication(
      vi.fn().mockRejectedValue(resolverError),
    );

    const response = await request(app.getHttpServer())
      .get('/cors-probe')
      .set('origin', 'https://alpha.app.example.test');

    expect(response.status).toBe(503);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(reportResolverError).toHaveBeenCalledWith(resolverError);
  });
});
