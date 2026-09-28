import { ApiProperty } from '@nestjs/swagger';

export class ChannelPolicyInputDto {
  @ApiProperty({ enum: ['immediate', 'staff_approval'] })
  confirmationMode?: string;
}

export type ChannelPolicyInput = Readonly<{
  confirmationMode: 'immediate' | 'staff_approval';
}>;
