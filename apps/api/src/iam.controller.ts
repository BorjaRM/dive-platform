import { randomUUID } from 'node:crypto';
import {
  IDENTITY_PROVIDER,
  type IdentityProviderPort,
} from '@dive-center/identity';
import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import { IamService } from './iam.service.js';
import { SECURITY_LOGGER, type SecurityLoggerPort } from './iam.tokens.js';

@Controller('v1/tenants/:tenantId')
export class IamController {
  constructor(
    @Inject(IDENTITY_PROVIDER)
    private readonly identities: IdentityProviderPort,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  private async principal(authorization?: string) {
    const token = authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException('Unauthenticated');
    try {
      return await this.identities.authenticate(token);
    } catch {
      throw new UnauthorizedException('Unauthenticated');
    }
  }

  private async execute<T>(
    authorization: string | undefined,
    action: (
      principal: Awaited<ReturnType<IamController['principal']>>,
      correlationId: string,
    ) => Promise<T>,
  ) {
    const correlationId = randomUUID();
    try {
      return await action(await this.principal(authorization), correlationId);
    } catch (error) {
      this.logger.warn({ event: 'iam_request_denied', correlationId });
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      )
        throw error;
      throw new ForbiddenException('Access denied');
    }
  }

  @Get('centers/:centerId')
  readCenter(
    @Headers('authorization') authorization: string | undefined,
    @Param('tenantId') tenantId: string,
    @Param('centerId') centerId: string,
  ) {
    return this.execute(authorization, (principal) =>
      this.iam.readCenter(principal, tenantId, centerId),
    );
  }

  @Patch('memberships/:membershipId/disable')
  disableMembership(
    @Headers('authorization') authorization: string | undefined,
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.execute(authorization, (principal, correlationId) =>
      this.iam.disableMembership(
        principal,
        tenantId,
        membershipId,
        correlationId,
      ),
    );
  }
}
