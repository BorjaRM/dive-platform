import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { correlationIdForCurrentContext } from '@dive-center/observability';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  RequestMethod,
  UnauthorizedException,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import {
  AUTH_ACTION_METADATA,
  ClerkAuthGuard,
} from '../common/auth/auth.guard.js';
import { BffServiceCredentialVerifier } from '../common/auth/bff-service-credential.js';
import {
  HTTP_ADMISSION_METADATA,
  type HttpAdmissionClassification,
  nonCenterAdmissionExceptions,
  type ResolvedCenterApplicationScope,
} from '../common/auth/http-admission.js';
import type { IamAction } from '../common/security/security.tokens.js';
import { TenantContextService } from './tenant-context/tenant-context.service.js';

type AdmissionRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  principal?: AuthenticatedPrincipal;
  applicationScope?: ResolvedCenterApplicationScope;
};

@Injectable()
export class ApplicationAdmissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(BffServiceCredentialVerifier)
    private readonly credentials: BffServiceCredentialVerifier,
    @Inject(ClerkAuthGuard) private readonly users: ClerkAuthGuard,
    @Inject(TenantContextService)
    private readonly contexts: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdmissionRequest>();
    const controllerClassification =
      this.reflector.get<HttpAdmissionClassification>(
        HTTP_ADMISSION_METADATA,
        context.getClass(),
      );
    const handlerClassification =
      this.reflector.get<HttpAdmissionClassification>(
        HTTP_ADMISSION_METADATA,
        context.getHandler(),
      );
    if (
      controllerClassification &&
      handlerClassification &&
      JSON.stringify(controllerClassification) !==
        JSON.stringify(handlerClassification)
    ) {
      throw new ForbiddenException('Access denied');
    }
    const classification = handlerClassification ?? controllerClassification;
    const method = this.reflector.get<RequestMethod>(
      METHOD_METADATA,
      context.getHandler(),
    );
    if (
      !classification ||
      method === undefined ||
      RequestMethod[method] !== request.method
    ) {
      throw new ForbiddenException('Access denied');
    }

    const controllerPath = this.reflector.get<string>(
      PATH_METADATA,
      context.getClass(),
    );
    const handlerPath = this.reflector.get<string>(
      PATH_METADATA,
      context.getHandler(),
    );
    if (typeof controllerPath !== 'string' || typeof handlerPath !== 'string') {
      throw new ForbiddenException('Access denied');
    }
    const path = `/${[controllerPath, handlerPath].join('/').split('/').filter(Boolean).join('/')}`;

    if (classification.kind === 'exception') {
      const exception = nonCenterAdmissionExceptions[classification.exception];
      if (
        !exception ||
        exception.method !== request.method ||
        exception.path !== path
      ) {
        throw new ForbiddenException('Access denied');
      }
      if (exception.mechanism === 'clerk')
        await this.users.canActivate(context);
      return true;
    }

    if (
      classification.kind !== 'center-data' &&
      classification.kind !== 'center-bootstrap'
    ) {
      throw new ForbiddenException('Access denied');
    }
    if (
      classification.kind === 'center-bootstrap' &&
      (request.method !== 'POST' || path !== '/v1/me/center-entry-contexts')
    ) {
      throw new ForbiddenException('Access denied');
    }

    if (
      !this.credentials.authenticate(
        request.headers['x-bff-service-credential'],
      )
    ) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'bff_service_authentication_failed',
        message: 'Service authentication failed',
      });
    }
    await this.users.canActivate(context);
    const principal = request.principal;
    if (!principal) throw new UnauthorizedException('Unauthenticated');
    const requestedOrigin = request.headers['x-bff-center-origin'];
    if (typeof requestedOrigin !== 'string')
      throw new ForbiddenException('Access denied');

    if (classification.kind === 'center-bootstrap') {
      if (request.headers.origin !== requestedOrigin)
        throw new ForbiddenException('Access denied');
      return true;
    }

    const handle = request.headers['x-tenant-context'];
    if (typeof handle !== 'string')
      throw new ForbiddenException('Access denied');
    const action =
      this.reflector.get<IamAction>(
        AUTH_ACTION_METADATA,
        context.getHandler(),
      ) ?? 'center.read';
    request.applicationScope =
      await this.contexts.resolveCenterApplicationScope(
        principal,
        handle,
        requestedOrigin,
        action,
        correlationIdForCurrentContext(),
      );
    return true;
  }
}
