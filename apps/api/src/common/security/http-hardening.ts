import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import {
  type Environment,
  runtimeEnvironmentFromEnvironment,
} from '../config/environment.js';

type HttpApplication = Pick<INestApplication, 'use'>;

export type ApiRateLimitConfiguration = Readonly<{
  max: number;
  windowMs: number;
}>;

function positiveIntegerFromEnvironment(
  environment: Environment,
  name: string,
): number | undefined {
  const value = environment[name]?.trim();
  if (value === undefined || value === '') return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`Invalid ${name}`);

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${name}`);
  }
  return parsed;
}

export function apiRateLimitConfigurationFromEnvironment(
  environment: Environment,
): ApiRateLimitConfiguration | undefined {
  const runtimeEnvironment = runtimeEnvironmentFromEnvironment(environment);
  const windowMs = positiveIntegerFromEnvironment(
    environment,
    'API_RATE_LIMIT_WINDOW_MS',
  );
  const max = positiveIntegerFromEnvironment(environment, 'API_RATE_LIMIT_MAX');

  if (windowMs === undefined && max === undefined) {
    if (
      runtimeEnvironment === 'staging' ||
      runtimeEnvironment === 'preview' ||
      runtimeEnvironment === 'production'
    ) {
      throw new Error(
        'Missing API_RATE_LIMIT_WINDOW_MS and API_RATE_LIMIT_MAX',
      );
    }
    return undefined;
  }

  if (windowMs === undefined) {
    throw new Error('Missing API_RATE_LIMIT_WINDOW_MS');
  }
  if (max === undefined) throw new Error('Missing API_RATE_LIMIT_MAX');

  return { max, windowMs };
}

export function configureHttpSecurity(
  app: HttpApplication,
  environment: Environment,
): void {
  app.use(helmet());

  const rateLimitConfiguration =
    apiRateLimitConfigurationFromEnvironment(environment);
  if (!rateLimitConfiguration) return;

  app.use(
    rateLimit({
      ...rateLimitConfiguration,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
}

export function swaggerEnabledFromEnvironment(
  environment: Environment,
): boolean {
  const runtimeEnvironment = runtimeEnvironmentFromEnvironment(environment);
  const configured = environment.API_SWAGGER_ENABLED?.trim().toLowerCase();

  if (configured === undefined || configured === '') return false;
  if (configured !== 'true' && configured !== 'false') {
    throw new Error('Invalid API_SWAGGER_ENABLED');
  }
  if (runtimeEnvironment === 'production' && configured === 'true') {
    throw new Error('Invalid API_SWAGGER_ENABLED');
  }
  return configured === 'true';
}

export function configureOpenApi(
  app: INestApplication,
  environment: Environment,
): boolean {
  if (!swaggerEnabledFromEnvironment(environment)) return false;

  const openApiConfig = new DocumentBuilder()
    .setTitle('Dive Platform API')
    .setDescription('REST API for the Dive Platform.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('docs', app, openApiDocument);
  return true;
}
