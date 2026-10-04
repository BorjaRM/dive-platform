import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ResolvedCenterApplicationScope } from '../common/auth/http-admission.js';
import { CatalogAccessService } from './catalog-access.service.js';

@Injectable()
export class CatalogCenterScopeGuard implements CanActivate {
  constructor(
    @Inject(CatalogAccessService) private readonly access: CatalogAccessService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      applicationScope?: ResolvedCenterApplicationScope;
      params: { centerId: string };
    }>();
    if (!request.applicationScope)
      throw new UnauthorizedException('Unauthenticated');
    this.access.assertRequestedCenterScope(
      request.applicationScope,
      request.params.centerId,
    );
    return true;
  }
}
