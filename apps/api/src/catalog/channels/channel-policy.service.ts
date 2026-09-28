import { randomUUID } from 'node:crypto';
import { bookingChannels } from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { CatalogProblemException } from '../catalog.errors.js';
import { uuid } from '../catalog.validation.js';
import { CatalogAccessService } from '../catalog-access.service.js';
import type { ChannelPolicyInput } from './channel-policy.dto.js';

@Injectable()
export class ChannelPolicyService {
  constructor(
    @Inject(CatalogAccessService)
    private readonly access: CatalogAccessService,
  ) {}

  async updatePolicy(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    channelId: string,
    input: ChannelPolicyInput,
  ): Promise<void> {
    uuid(channelId, 'channelId');
    return this.access.authorized(
      principal,
      handle,
      centerId,
      'channel.manage',
      async ({ context, unitOfWork, recordMutation }) => {
        const [channel] = await unitOfWork.db
          .select({
            id: bookingChannels.id,
            confirmationMode: bookingChannels.confirmationMode,
          })
          .from(bookingChannels)
          .where(
            and(
              eq(bookingChannels.tenantId, context.tenantId),
              eq(bookingChannels.centerId, centerId),
              eq(bookingChannels.id, channelId),
            ),
          )
          .limit(1)
          .for('update');
        if (!channel) {
          throw new CatalogProblemException(404, 'resource_not_found');
        }
        if (channel.confirmationMode === input.confirmationMode) return;
        await unitOfWork.db
          .update(bookingChannels)
          .set({ confirmationMode: input.confirmationMode })
          .where(
            and(
              eq(bookingChannels.tenantId, context.tenantId),
              eq(bookingChannels.centerId, centerId),
              eq(bookingChannels.id, channelId),
            ),
          );
        await recordMutation({
          action: 'booking.update',
          eventType: 'booking.channel.policy_updated.v1',
          resourceType: 'channel',
          resourceId: channelId,
          payload: {
            channelId,
            centerId,
            confirmationMode: input.confirmationMode,
          },
          idempotencyKey: `booking.channel.policy:${channelId}:${randomUUID()}`,
        });
      },
    );
  }
}
