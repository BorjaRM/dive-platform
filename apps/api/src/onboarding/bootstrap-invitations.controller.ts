import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { correlationIdForCurrentContext } from '@dive-center/observability';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClerkAuthGuard, Principal } from '../common/auth/auth.guard.js';
import { HttpAdmission } from '../common/auth/http-admission.js';
import { ApiProblemFilter } from '../common/http/problem-details.js';
import {
  type BootstrapInvitationIssueInput,
  BootstrapInvitationIssueInputDto,
  type BootstrapInvitationMutationInput,
  BootstrapInvitationMutationInputDto,
  BootstrapInvitationStateDto,
} from './bootstrap-invitations.dto.js';
import { BootstrapInvitationsService } from './bootstrap-invitations.service.js';
import {
  BootstrapInvitationIssueInputPipe,
  BootstrapInvitationMutationInputPipe,
  BootstrapInvitationUuidPipe,
} from './bootstrap-invitations.validation.pipe.js';

@ApiTags('Platform onboarding')
@ApiBearerAuth()
@UseFilters(ApiProblemFilter)
@UseGuards(ClerkAuthGuard)
@Controller('v1/platform/bootstrap-invitations')
export class BootstrapInvitationsController {
  constructor(
    @Inject(BootstrapInvitationsService)
    private readonly invitations: BootstrapInvitationsService,
  ) {}

  @Post()
  @HttpAdmission({ kind: 'exception', exception: 'bootstrapInvitationIssue' })
  @ApiOperation({ summary: 'Issue a tenant bootstrap invitation' })
  @ApiBody({ type: BootstrapInvitationIssueInputDto })
  @ApiCreatedResponse({ type: BootstrapInvitationStateDto })
  issue(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(BootstrapInvitationIssueInputPipe)
    input: BootstrapInvitationIssueInput,
  ) {
    return this.invitations.issue(
      principal,
      input,
      idempotencyKey,
      correlationIdForCurrentContext(),
    );
  }

  @Get(':invitationId')
  @HttpAdmission({ kind: 'exception', exception: 'bootstrapInvitationRead' })
  @ApiOperation({ summary: 'Read safe bootstrap invitation state' })
  @ApiOkResponse({ type: BootstrapInvitationStateDto })
  read(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('invitationId', BootstrapInvitationUuidPipe) invitationId: string,
  ) {
    return this.invitations.read(principal, invitationId);
  }

  @Post(':invitationId/reissue')
  @HttpAdmission({ kind: 'exception', exception: 'bootstrapInvitationReissue' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supersede and reissue a bootstrap invitation' })
  @ApiBody({ type: BootstrapInvitationMutationInputDto })
  @ApiOkResponse({ type: BootstrapInvitationStateDto })
  reissue(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('invitationId', BootstrapInvitationUuidPipe) invitationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(BootstrapInvitationMutationInputPipe)
    input: BootstrapInvitationMutationInput,
  ) {
    return this.invitations.reissue(
      principal,
      invitationId,
      input,
      idempotencyKey,
      correlationIdForCurrentContext(),
    );
  }

  @Post(':invitationId/revoke')
  @HttpAdmission({ kind: 'exception', exception: 'bootstrapInvitationRevoke' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a bootstrap invitation' })
  @ApiBody({ type: BootstrapInvitationMutationInputDto })
  @ApiOkResponse({ type: BootstrapInvitationStateDto })
  revoke(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('invitationId', BootstrapInvitationUuidPipe) invitationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(BootstrapInvitationMutationInputPipe)
    input: BootstrapInvitationMutationInput,
  ) {
    return this.invitations.revoke(
      principal,
      invitationId,
      input,
      idempotencyKey,
      correlationIdForCurrentContext(),
    );
  }
}
