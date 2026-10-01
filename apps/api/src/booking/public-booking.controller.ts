import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { HttpAdmission } from '../common/auth/http-admission.js';
import { ApiProblemFilter } from '../common/http/problem-details.js';
import {
  type PublicBookingInput,
  PublicBookingInputDto,
  PublicBookingResponseDto,
} from './public-booking.dto.js';
import { PublicBookingService } from './public-booking.service.js';
import { PublicBookingInputPipe } from './public-booking.validation.pipe.js';

@ApiTags('Public booking')
@UseFilters(ApiProblemFilter)
@Controller('v1/public/channels')
export class PublicBookingController {
  constructor(
    @Inject(PublicBookingService)
    private readonly bookings: PublicBookingService,
  ) {}

  @Post(':channelPublicId/bookings')
  @HttpAdmission({ kind: 'exception', exception: 'publicBooking' })
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: PublicBookingInputDto })
  @ApiOperation({
    summary: 'Create a booking through a published hosted channel',
  })
  @ApiCreatedResponse({ type: PublicBookingResponseDto })
  async create(
    @Param('channelPublicId') channelPublicId: string,
    @Headers('origin') origin: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(PublicBookingInputPipe) input: PublicBookingInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.bookings.create(
      channelPublicId,
      origin,
      idempotencyKey,
      input,
    );
    if (result.replayed) response.status(HttpStatus.OK);
    return result.response;
  }
}
