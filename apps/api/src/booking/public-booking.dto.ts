import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicBookerDto {
  @ApiProperty()
  firstName?: string;

  @ApiProperty()
  lastName?: string;

  @ApiProperty()
  email?: string;

  @ApiPropertyOptional()
  phone?: string;
}

export class PublicBookingInputDto {
  @ApiProperty({ format: 'uuid' })
  slotId?: string;

  @ApiProperty()
  seats?: number;

  @ApiProperty({ enum: ['es', 'en'] })
  locale?: string;

  @ApiProperty({ type: PublicBookerDto })
  booker?: PublicBookerDto;
}

export class PublicBookingResponseDto {
  @ApiProperty({ format: 'uuid' })
  bookingId!: string;

  @ApiProperty({ enum: ['Pending', 'Confirmed'] })
  status!: 'Pending' | 'Confirmed';

  @ApiProperty()
  seats!: number;

  @ApiProperty({ enum: ['es', 'en'] })
  locale!: 'es' | 'en';

  @ApiProperty()
  confirmationReadToken!: string;

  @ApiProperty()
  cancelToken!: string;
}

export type PublicBookingInput = Readonly<{
  slotId: string;
  seats: number;
  locale: 'es' | 'en';
  booker: Readonly<{
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  }>;
}>;
