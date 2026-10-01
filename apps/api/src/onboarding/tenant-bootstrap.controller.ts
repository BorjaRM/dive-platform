import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { correlationIdForCurrentContext } from '@dive-center/observability';
import {
  Body,
  Controller,
  Inject,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClerkAuthGuard, Principal } from '../common/auth/auth.guard.js';
import { HttpAdmission } from '../common/auth/http-admission.js';
import { ApiProblemFilter } from '../common/http/problem-details.js';
import {
  type TenantBootstrapInput,
  TenantBootstrapInputDto,
  TenantBootstrapResultDto,
} from './tenant-bootstrap.dto.js';
import { TenantBootstrapService } from './tenant-bootstrap.service.js';
import { TenantBootstrapInputPipe } from './tenant-bootstrap.validation.pipe.js';

@ApiTags('Onboarding')
@ApiBearerAuth()
@UseFilters(ApiProblemFilter)
@UseGuards(ClerkAuthGuard)
@Controller('v1/me/tenant-bootstrap')
export class TenantBootstrapController {
  constructor(
    @Inject(TenantBootstrapService)
    private readonly bootstrap: TenantBootstrapService,
  ) {}

  @Post()
  @HttpAdmission({ kind: 'exception', exception: 'tenantBootstrap' })
  @ApiOperation({
    summary: 'Complete the authenticated identity tenant bootstrap',
  })
  @ApiBody({ type: TenantBootstrapInputDto })
  @ApiOkResponse({ type: TenantBootstrapResultDto })
  complete(
    @Principal() principal: AuthenticatedPrincipal,
    @Body(TenantBootstrapInputPipe) input: TenantBootstrapInput,
  ) {
    return this.bootstrap.complete(
      principal,
      input,
      correlationIdForCurrentContext(),
    );
  }
}
