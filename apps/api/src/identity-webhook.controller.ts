import { randomUUID } from 'node:crypto';
import {
  applyIdentityWebhook,
  sessionIdHashForWebhook,
} from '@dive-center/database';
import {
  IDENTITY_WEBHOOK_VERIFIER,
  type IdentityWebhookEvent,
  type IdentityWebhookVerifierPort,
} from '@dive-center/identity';
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  RawBody,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Pool } from 'pg';
import { DATABASE_POOL, TENANT_CONTEXT_CRYPTO } from './common/tokens.js';
import {
  IAM_ACTIONS,
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from './iam.tokens.js';
import { WebhookAckDto } from './identity-webhook.dto.js';
import type { TenantContextCrypto } from './tenant-context.crypto.js';

@ApiTags('Webhooks')
@Controller('v1/webhooks')
export class IdentityWebhookController {
  constructor(
    @Inject(IDENTITY_WEBHOOK_VERIFIER)
    private readonly verifier: IdentityWebhookVerifierPort,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
    @Inject(TENANT_CONTEXT_CRYPTO)
    private readonly contextCrypto: TenantContextCrypto,
  ) {}

  @ApiOperation({
    summary: 'Receive a Clerk identity webhook',
    description:
      'Verifies the Svix signature on the raw request body and applies the identity event. Not bearer-authenticated.',
  })
  @ApiOkResponse({ type: WebhookAckDto })
  @ApiBadRequestResponse({
    description: 'Missing raw body or invalid webhook signature',
  })
  @ApiServiceUnavailableResponse({
    description: 'Webhook verified but could not be applied',
  })
  @Post('clerk')
  @HttpCode(200)
  async receiveClerkWebhook(
    @RawBody() rawBody: Buffer | undefined,
    @Headers()
    headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  ) {
    const correlationId = randomUUID();
    let event: IdentityWebhookEvent;
    try {
      if (!rawBody?.length) throw new Error('Missing raw body');
      event = await this.verifier.verify(rawBody, headers);
    } catch {
      this.logger.warn({
        event: 'iam_security_event',
        action: IAM_ACTIONS.identityWebhookApply,
        reason: 'authentication_missing_or_invalid',
        correlationId,
      });
      throw new BadRequestException('Invalid webhook');
    }

    try {
      await applyIdentityWebhook(
        this.pool,
        event,
        correlationId,
        sessionIdHashForWebhook(event, (sessionId) =>
          this.contextCrypto.sessionIdHash(sessionId),
        ),
      );
    } catch {
      this.logger.warn({
        event: 'iam_security_event',
        action: IAM_ACTIONS.identityWebhookApply,
        reason: 'invariant_violation',
        correlationId,
      });
      throw new ServiceUnavailableException('Webhook unavailable');
    }
    return { received: true };
  }
}
