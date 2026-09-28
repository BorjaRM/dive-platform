import { Module } from '@nestjs/common';
import { PublicBookingController } from './public-booking.controller.js';
import {
  PUBLIC_BOOKING_CAPABILITY_CRYPTO,
  PublicBookingCapabilityCrypto,
  publicBookingCapabilitySecretFromEnvironment,
} from './public-booking.crypto.js';
import { PublicBookingPersistence } from './public-booking.persistence.js';
import { PublicBookingService } from './public-booking.service.js';

@Module({
  controllers: [PublicBookingController],
  providers: [
    PublicBookingPersistence,
    PublicBookingService,
    {
      provide: PUBLIC_BOOKING_CAPABILITY_CRYPTO,
      useFactory: () =>
        new PublicBookingCapabilityCrypto(
          publicBookingCapabilitySecretFromEnvironment(process.env),
        ),
    },
  ],
})
export class PublicBookingModule {}
