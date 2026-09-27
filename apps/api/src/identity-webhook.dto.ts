import { ApiProperty } from '@nestjs/swagger';

export class WebhookAckDto {
  @ApiProperty({
    example: true,
    description: 'Acknowledges the webhook event was applied',
  })
  received: boolean;
}
