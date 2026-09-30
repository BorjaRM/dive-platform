import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { iamCenters, iamTenants } from './iam-schema.js';

export const bookingApp = pgSchema('booking_app');

export const ACTIVITY_STATUSES = ['Draft', 'Published', 'Disabled'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const SLOT_STATUSES = [
  'Available',
  'Full',
  'Closed',
  'Cancelled',
] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const CHANNEL_STATUSES = ['Draft', 'Published', 'Disabled'] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export const CHANNEL_TYPES = ['single_activity'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CONFIRMATION_MODES = ['immediate', 'staff_approval'] as const;
export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number];

export const BOOKING_STATUSES = [
  'Pending',
  'Confirmed',
  'Rejected',
  'Cancelled',
  'Expired',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_CAPABILITY_PURPOSES = [
  'booking_confirmation_read',
  'booking_cancel',
] as const;
export type BookingCapabilityPurpose =
  (typeof BOOKING_CAPABILITY_PURPOSES)[number];

export type LocalizedText = {
  es?: string;
  en?: string;
};

export const bookingCatalogSettings = bookingApp.table(
  'catalog_settings',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    centerId: uuid('center_id').notNull(),
    defaultActivityLocale: text('default_activity_locale')
      .$type<'es' | 'en'>()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.centerId] }),
    foreignKey({
      columns: [table.tenantId, table.centerId],
      foreignColumns: [iamCenters.tenantId, iamCenters.id],
    }),
    check(
      'catalog_settings_locale_known',
      sql`default_activity_locale IN ('es', 'en')`,
    ),
  ],
);

export const bookingActivities = bookingApp.table(
  'activities',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    centerId: uuid('center_id').notNull(),
    baseLocale: text('base_locale').$type<'es' | 'en'>().notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    description: jsonb('description').$type<LocalizedText>(),
    defaultCapacity: integer('default_capacity'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('activities_tenant_center_id_unique').on(
      table.tenantId,
      table.centerId,
      table.id,
    ),
    foreignKey({
      columns: [table.tenantId, table.centerId],
      foreignColumns: [iamCenters.tenantId, iamCenters.id],
    }),
    check(
      'activities_status_known',
      sql`status IN ('Draft', 'Published', 'Disabled')`,
    ),
    check('activities_base_locale_known', sql`base_locale IN ('es', 'en')`),
    check(
      'activities_default_capacity_positive',
      sql`default_capacity IS NULL OR default_capacity > 0`,
    ),
    index('activities_center_status_created_id_idx').on(
      table.tenantId,
      table.centerId,
      table.status,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('activities_center_created_id_idx').on(
      table.tenantId,
      table.centerId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const bookingSlots = bookingApp.table(
  'slots',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    centerId: uuid('center_id').notNull(),
    activityId: uuid('activity_id').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    capacity: integer('capacity').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('slots_tenant_center_id_unique').on(
      table.tenantId,
      table.centerId,
      table.id,
    ),
    foreignKey({
      columns: [table.tenantId, table.centerId],
      foreignColumns: [iamCenters.tenantId, iamCenters.id],
    }),
    foreignKey({
      columns: [table.tenantId, table.centerId, table.activityId],
      foreignColumns: [
        bookingActivities.tenantId,
        bookingActivities.centerId,
        bookingActivities.id,
      ],
    }),
    check('slots_duration_minutes_positive', sql`duration_minutes > 0`),
    check('slots_capacity_positive', sql`capacity > 0`),
    check(
      'slots_status_known',
      sql`status IN ('Available', 'Full', 'Closed', 'Cancelled')`,
    ),
    index('slots_activity_status_starts_id_idx').on(
      table.tenantId,
      table.centerId,
      table.activityId,
      table.status,
      table.startsAt,
      table.id,
    ),
    index('slots_activity_starts_id_idx').on(
      table.tenantId,
      table.centerId,
      table.activityId,
      table.startsAt,
      table.id,
    ),
  ],
);

export const bookingChannels = bookingApp.table(
  'channels',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    centerId: uuid('center_id').notNull(),
    publicId: text('public_id').notNull(),
    type: text('type').notNull(),
    activityId: uuid('activity_id').notNull(),
    status: text('status').notNull(),
    confirmationMode: text('confirmation_mode').notNull().default('immediate'),
    allowedOrigins: text('allowed_origins').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('channels_tenant_center_id_unique').on(
      table.tenantId,
      table.centerId,
      table.id,
    ),
    unique('channels_public_id_unique').on(table.publicId),
    foreignKey({
      columns: [table.tenantId, table.centerId],
      foreignColumns: [iamCenters.tenantId, iamCenters.id],
    }),
    foreignKey({
      columns: [table.tenantId, table.centerId, table.activityId],
      foreignColumns: [
        bookingActivities.tenantId,
        bookingActivities.centerId,
        bookingActivities.id,
      ],
    }),
    check('channels_type_known', sql`type IN ('single_activity')`),
    check(
      'channels_status_known',
      sql`status IN ('Draft', 'Published', 'Disabled')`,
    ),
    check(
      'channels_confirmation_mode_known',
      sql`confirmation_mode IN ('immediate', 'staff_approval')`,
    ),
    check(
      'channels_allowed_origins_nonempty',
      sql`cardinality(allowed_origins) > 0 AND NOT ('*' = ANY(allowed_origins))`,
    ),
    index('channels_tenant_center_status_idx').on(
      table.tenantId,
      table.centerId,
      table.status,
    ),
  ],
);

export const bookingBookings = bookingApp.table(
  'bookings',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    centerId: uuid('center_id').notNull(),
    channelId: uuid('channel_id').notNull(),
    slotId: uuid('slot_id').notNull(),
    bookingChannel: text('booking_channel').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: text('status').notNull(),
    seats: integer('seats').notNull(),
    locale: text('locale').notNull(),
    bookerFirstName: text('booker_first_name').notNull(),
    bookerLastName: text('booker_last_name').notNull(),
    bookerEmail: text('booker_email').notNull(),
    bookerPhone: text('booker_phone'),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('bookings_tenant_center_id_unique').on(
      table.tenantId,
      table.centerId,
      table.id,
    ),
    unique('bookings_tenant_channel_idempotency_unique').on(
      table.tenantId,
      table.channelId,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.tenantId, table.centerId, table.channelId],
      foreignColumns: [
        bookingChannels.tenantId,
        bookingChannels.centerId,
        bookingChannels.id,
      ],
    }),
    foreignKey({
      columns: [table.tenantId, table.centerId, table.slotId],
      foreignColumns: [
        bookingSlots.tenantId,
        bookingSlots.centerId,
        bookingSlots.id,
      ],
    }),
    check('bookings_channel_known', sql`booking_channel IN ('public_hosted')`),
    check(
      'bookings_status_known',
      sql`status IN ('Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Expired')`,
    ),
    check('bookings_seats_positive', sql`seats > 0`),
    check('bookings_locale_known', sql`locale IN ('es', 'en')`),
    check(
      'bookings_contact_nonempty',
      sql`
      btrim(booker_first_name) <> '' AND
      btrim(booker_last_name) <> '' AND
      btrim(booker_email) <> ''
    `,
    ),
    index('bookings_tenant_slot_status_idx').on(
      table.tenantId,
      table.slotId,
      table.status,
    ),
    index('bookings_tenant_channel_created_idx').on(
      table.tenantId,
      table.channelId,
      table.createdAt,
    ),
  ],
);

export const bookingCapabilityVerifiers = bookingApp.table(
  'capability_verifiers',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    bookingId: uuid('booking_id').notNull(),
    purpose: text('purpose').notNull(),
    version: integer('version').notNull(),
    verifierHash: text('verifier_hash').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('capability_verifiers_booking_purpose_version_unique').on(
      table.tenantId,
      table.bookingId,
      table.purpose,
      table.version,
    ),
    foreignKey({
      columns: [table.tenantId, table.bookingId],
      foreignColumns: [bookingBookings.tenantId, bookingBookings.id],
    }),
    check(
      'capability_verifiers_purpose_known',
      sql`purpose IN ('booking_confirmation_read', 'booking_cancel')`,
    ),
    check('capability_verifiers_version_positive', sql`version > 0`),
    check(
      'capability_verifiers_hash_nonempty',
      sql`btrim(verifier_hash) <> ''`,
    ),
    index('capability_verifiers_lookup_idx').on(
      table.tenantId,
      table.bookingId,
      table.purpose,
      table.verifierHash,
    ),
  ],
);
