import {
  type AuthenticatedPrincipal,
  authenticateIdentity,
  IDENTITY_PROVIDER,
  type IdentityProviderPort,
  IdentityProviderUnavailableError,
} from '@dive-center/identity';
import { correlationIdForCurrentContext } from '@dive-center/observability';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  type IamAction,
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from '../security/security.tokens.js';

export const AUTH_ACTION_METADATA = 'api:auth-action';
export const AuthAction = (action: IamAction) =>
  SetMetadata(AUTH_ACTION_METADATA, action);

type AuthenticatedRequest = {
  headers: { authorization?: string };
  principal?: AuthenticatedPrincipal;
};

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_PROVIDER)
    private readonly identities: IdentityProviderPort,
    @Inject(SECURITY_LOGGER)
    private readonly logger: SecurityLoggerPort,
    @Inject(Reflector)
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) {
      this.logAuthenticationFailure(context);
      throw new UnauthorizedException('Unauthenticated');
    }
    try {
      request.principal = await authenticateIdentity(this.identities, token);
      return true;
    } catch (error) {
      if (error instanceof IdentityProviderUnavailableError) {
        this.logAuthenticationOperationalFailure();
        throw new ServiceUnavailableException(
          'Authentication service unavailable',
        );
      }
      this.logAuthenticationFailure(context);
      throw new UnauthorizedException('Unauthenticated');
    }
  }

  private logAuthenticationOperationalFailure(): void {
    this.logger.operational?.({
      event: 'identity_provider_unavailable',
      correlationId: correlationIdForCurrentContext(),
    });
  }

  private logAuthenticationFailure(context: ExecutionContext): void {
    const action = this.reflector.get<IamAction>(
      AUTH_ACTION_METADATA,
      context.getHandler(),
    );
    if (!action) return;
    this.logger.warn({
      event: 'iam_security_event',
      action,
      reason: 'authentication_missing_or_invalid',
      correlationId: correlationIdForCurrentContext(),
    });
  }
}

export const Principal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) throw new UnauthorizedException('Unauthenticated');
    return request.principal;
  },
);
