import {
  IDENTITY_PROVIDER,
  IDENTITY_WEBHOOK_VERIFIER,
} from '@dive-center/identity';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from './../src/app/app.module.js';

describe('AppModule HTTP composition (e2e)', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;

  beforeEach(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('does not expose the retired root greeting', () => {
    return request(app.getHttpServer()).get('/').expect(404);
  });

  it('uses one production Clerk adapter for session and webhook ports', () => {
    expect(moduleFixture.get(IDENTITY_PROVIDER)).toBe(
      moduleFixture.get(IDENTITY_WEBHOOK_VERIFIER),
    );
  });

  afterEach(async () => {
    await app.close();
  });
});
