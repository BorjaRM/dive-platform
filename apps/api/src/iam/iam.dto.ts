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

export class IssueCenterEntryContextDto {
  @ApiProperty({ description: 'Center key matching the exact request origin' })
  centerRef: string;
}

export class UpdateCenterEntryStatusDto {
  @ApiProperty({ enum: ['active', 'disabled'] })
  status: 'active' | 'disabled';

  @ApiProperty({ description: 'Administrative purpose for the state change' })
  purpose: string;
}

export class CenterEntryStatusDto {
  @ApiProperty({ description: 'Whether the persisted status changed' })
  changed: boolean;

  @ApiProperty({ enum: ['active', 'disabled'] })
  status: 'active' | 'disabled';
}

export class TenantContextDto {
  @ApiProperty({ description: 'Opaque tenant context handle; shown once' })
  tenantContext: string;
}

export class CenterEntryContextDto extends TenantContextDto {
  @ApiProperty({
    description: 'Center selected by the trusted entry mapping',
    example: { centerId: 'aaaaaaaa-0001-0001-0001-000000000001' },
  })
  center: { centerId: string };
}
