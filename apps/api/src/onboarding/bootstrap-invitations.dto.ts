import { ApiProperty } from '@nestjs/swagger';

export type BootstrapInvitationIssueInput = Readonly<{
  destinationEmail: string;
  reason: string;
}>;

export type BootstrapInvitationMutationInput = Readonly<{
  reason: string;
}>;

export class BootstrapInvitationIssueInputDto {
  @ApiProperty({ format: 'email' })
  destinationEmail!: string;

  @ApiProperty()
  reason!: string;
}

export class BootstrapInvitationMutationInputDto {
  @ApiProperty()
  reason!: string;
}

export class BootstrapInvitationStateDto {
  @ApiProperty({ format: 'uuid' })
  invitationId!: string;

  @ApiProperty({
    enum: ['issued', 'consumed', 'revoked', 'expired', 'superseded'],
  })
  status!: string;

  @ApiProperty({ enum: ['pending', 'retrying', 'succeeded', 'dead_letter'] })
  deliveryStatus!: string;

  @ApiProperty({ required: false })
  issuedAt?: string;

  @ApiProperty({ required: false })
  expiresAt?: string;
}
