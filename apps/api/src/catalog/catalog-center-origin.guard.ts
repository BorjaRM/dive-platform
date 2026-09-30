import type { AuthenticatedPrincipal } from '@dive-center/identity';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CatalogAccessService } from './catalog-access.service.js';

@Injectable()
export class CatalogCenterOriginGuard implements CanActivate {
  constructor(
    @Inject(CatalogAccessService) private readonly access: CatalogAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      principal?: AuthenticatedPrincipal;
      headers: { origin?: string; 'x-tenant-context'?: string };
      params: { centerId: string };
    }>();
    if (!request.principal) throw new UnauthorizedException('Unauthenticated');
    await this.access.assertCenterOriginScope(
      request.principal,
      request.headers['x-tenant-context'],
      request.params.centerId,
      request.headers.origin,
    );
    return true;
  }
}
