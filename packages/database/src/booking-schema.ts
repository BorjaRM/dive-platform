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

export type LocalizedText = {
  es?: string;
  en?: string;
};

export const bookingActivities = bookingApp.table(
  'activities',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    centerId: uuid('center_id').notNull(),
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
