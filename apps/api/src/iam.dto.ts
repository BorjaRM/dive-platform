import { ApiProperty } from '@nestjs/swagger';

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
