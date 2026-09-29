import { ApiProperty } from '@nestjs/swagger';

export type TenantBootstrapInput = Readonly<{
  operatorDisplayName: string;
  centerDisplayName: string;
  timeZone: string;
  locale: 'en' | 'es';
}>;

export class TenantBootstrapInputDto {
  @ApiProperty({ maxLength: 120 })
  operatorDisplayName!: string;

  @ApiProperty({ maxLength: 120 })
  centerDisplayName!: string;

  @ApiProperty({ example: 'Europe/Madrid' })
  timeZone!: string;

  @ApiProperty({ enum: ['es', 'en'] })
  locale!: 'en' | 'es';
}

export class TenantBootstrapResultDto {
  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  centerId!: string;

  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty()
  centerKey!: string;
}
