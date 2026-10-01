import { bookingCatalogSettings } from '@dive-center/database';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { ResolvedCenterApplicationScope } from '../../common/auth/http-admission.js';
import type { CatalogSettingsInput } from '../catalog.dto.js';
import { CatalogProblemException } from '../catalog.errors.js';
import { parseCatalogSettingsInput } from '../catalog.validation.js';
import { CatalogAccessService } from '../catalog-access.service.js';

@Injectable()
export class CatalogSettingsService {
  constructor(
    @Inject(CatalogAccessService)
    private readonly access: CatalogAccessService,
  ) {}

  async getSettings(applicationScope: ResolvedCenterApplicationScope) {
    return this.access.authorized(
      applicationScope,
      'booking_service.read',
      async ({ context, center, db }) => {
        const [settings] = await db
          .select()
          .from(bookingCatalogSettings)
          .where(
            and(
              eq(bookingCatalogSettings.tenantId, context.tenantId),
              eq(bookingCatalogSettings.centerId, center.id),
            ),
          )
          .limit(1);
        return {
          defaultActivityLocale: settings?.defaultActivityLocale ?? null,
        };
      },
    );
  }

  async selectInitialLanguage(
    applicationScope: ResolvedCenterApplicationScope,
    input: CatalogSettingsInput,
  ) {
    return this.access.authorized(
      applicationScope,
      'booking_service.update',
      async ({ context, center, db, recordMutation }) => {
        const { defaultActivityLocale } = parseCatalogSettingsInput(input);
        const [inserted] = await db
          .insert(bookingCatalogSettings)
          .values({
            tenantId: context.tenantId,
            centerId: center.id,
            defaultActivityLocale,
          })
          .onConflictDoNothing({
            target: [
              bookingCatalogSettings.tenantId,
              bookingCatalogSettings.centerId,
            ],
          })
          .returning();
        if (inserted) {
          await recordMutation({
            action: 'booking.update',
            resourceType: 'catalog_settings',
            resourceId: center.id,
            eventType: null,
            payload: { defaultActivityLocale },
            idempotencyKey: null,
          });
          return;
        }
        const [selected] = await db
          .select()
          .from(bookingCatalogSettings)
          .where(
            and(
              eq(bookingCatalogSettings.tenantId, context.tenantId),
              eq(bookingCatalogSettings.centerId, center.id),
            ),
          )
          .limit(1);
        if (selected?.defaultActivityLocale !== defaultActivityLocale) {
          throw new CatalogProblemException(
            409,
            'center_catalog_locale_locked',
          );
        }
      },
    );
  }
}
