import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CenterDto {
  @ApiProperty({ format: 'uuid', description: 'Center identifier' })
  id: string;

  @ApiProperty({ description: 'Center display name' })
  name: string;
}

export class DisableMembershipResultDto {
  @ApiProperty({
    enum: ['disabled'],
    description: 'Resulting membership status',
  })
  status: 'disabled';
}

export class OperatorDto {
  @ApiProperty({ description: 'Opaque operator selector' })
  operatorRef: string;

  @ApiProperty({ description: 'Operator display name' })
  displayName: string;
}

export class OperatorListDto {
  @ApiProperty({ type: [OperatorDto] })
  operators: OperatorDto[];
}

export class IssueTenantContextDto {
  @ApiPropertyOptional({ description: 'Opaque operator selector' })
  operatorRef?: string;
}

export class TenantContextDto {
  @ApiProperty({ description: 'Opaque tenant context handle; shown once' })
  tenantContext: string;
}
