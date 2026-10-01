import {
  Controller,
  Get,
  Header,
  Inject,
  Module,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  CenterApplicationScope,
  HttpAdmission,
  type ResolvedCenterApplicationScope,
} from '../../common/auth/http-admission.js';
import { DatabaseModule } from '../../common/database/database.module.js';
import {
  BookingContactReadDto,
  BookingPageReadDto,
  CalendarPageReadDto,
} from './booking-read.dto.js';
import { BookingReadService } from './booking-read.service.js';

@ApiTags('Booking reads')
@ApiBearerAuth()
@HttpAdmission({ kind: 'center-data' })
@Controller('v1/centers/:centerId')
export class BookingReadController {
  constructor(
    @Inject(BookingReadService) private readonly reads: BookingReadService,
  ) {}

  @Get('calendar/slots')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Read an authorized overlapping calendar page and occupancy observation',
  })
  @ApiOkResponse({ type: CalendarPageReadDto })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'activityId', required: false, type: String })
  @ApiQuery({
    name: 'slotStatus',
    required: false,
    enum: ['Available', 'Full', 'Closed', 'Cancelled'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  calendar(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('centerId') centerId: string,
    @Query() query: unknown,
  ) {
    return this.reads.calendar(scope, centerId, query);
  }

  @Get('slots/:slotId/bookings')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read an authorized execution booking page without contacts',
  })
  @ApiOkResponse({ type: BookingPageReadDto })
  @ApiQuery({
    name: 'bookingStatus',
    required: false,
    enum: ['Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Expired'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  bookings(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('centerId') centerId: string,
    @Param('slotId') slotId: string,
    @Query() query: unknown,
  ) {
    return this.reads.bookings(scope, centerId, slotId, query);
  }

  @Get('bookings/:bookingId/contact')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Read purpose-limited booking contact after authorization and committed audit',
  })
  @ApiOkResponse({ type: BookingContactReadDto })
  contact(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('centerId') centerId: string,
    @Param('bookingId') bookingId: string,
    @Query() query: unknown,
  ) {
    return this.reads.contact(scope, centerId, bookingId, query);
  }
}

@Module({
  imports: [DatabaseModule],
  controllers: [BookingReadController],
  providers: [BookingReadService],
})
export class BookingReadModule {}
