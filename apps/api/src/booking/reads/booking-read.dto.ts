import { ApiProperty } from '@nestjs/swagger';

export class CalendarActivityReadDto {
  @ApiProperty({
    type: 'object',
    properties: { es: { type: 'string' }, en: { type: 'string' } },
  })
  name: Record<string, string>;
  @ApiProperty({ enum: ['es', 'en'] })
  baseLocale: 'es' | 'en';
}

export class CalendarSlotReadDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  activityId: string;
  @ApiProperty({ type: CalendarActivityReadDto })
  activity: CalendarActivityReadDto;
  @ApiProperty({ enum: ['Available', 'Full', 'Closed', 'Cancelled'] })
  status: 'Available' | 'Full' | 'Closed' | 'Cancelled';
  @ApiProperty({ format: 'date-time' })
  startsAt: string;
  @ApiProperty()
  durationMinutes: number;
  @ApiProperty()
  capacity: number;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
  @ApiProperty()
  confirmedSeats: number;
  @ApiProperty()
  heldSeats: number;
  @ApiProperty({ type: Number, nullable: true })
  remainingSeats: number | null;
}

export class CalendarPageReadDto {
  @ApiProperty({ type: [CalendarSlotReadDto] })
  items: CalendarSlotReadDto[];
  @ApiProperty()
  page: number;
  @ApiProperty()
  pageSize: number;
  @ApiProperty()
  hasNext: boolean;
  @ApiProperty({ format: 'date-time' })
  asOf: string;
}

export class BookingReadDto {
  @ApiProperty({ format: 'uuid' })
  bookingId: string;
  @ApiProperty({
    enum: ['Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Expired'],
  })
  status: 'Pending' | 'Confirmed' | 'Rejected' | 'Cancelled' | 'Expired';
  @ApiProperty()
  seats: number;
  @ApiProperty({ enum: ['public_hosted'] })
  bookingChannel: 'public_hosted';
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  holdExpiresAt: string | null;
}

export class BookingPageReadDto {
  @ApiProperty({ type: [BookingReadDto] })
  items: BookingReadDto[];
  @ApiProperty()
  page: number;
  @ApiProperty()
  pageSize: number;
  @ApiProperty()
  hasNext: boolean;
}

export class BookingContactFieldsDto {
  @ApiProperty()
  firstName: string;
  @ApiProperty()
  lastName: string;
  @ApiProperty()
  email: string;
  @ApiProperty({ type: String, nullable: true })
  phone: string | null;
}

export class BookingContactReadDto {
  @ApiProperty({ format: 'uuid' })
  bookingId: string;
  @ApiProperty({ type: BookingContactFieldsDto })
  booker: BookingContactFieldsDto;
}
