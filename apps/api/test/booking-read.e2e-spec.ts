import { randomUUID } from 'node:crypto';
import {
  bootstrapRoles,
  migrateProduct,
  resolveIamAccess,
} from '@dive-center/database';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { BookingReadController } from '../src/booking/reads/booking-read.controller.js';
import { BookingReadService } from '../src/booking/reads/booking-read.service.js';
import type { ResolvedCenterApplicationScope } from '../src/common/auth/http-admission.js';
import { ApiProblemFilter } from '../src/common/http/problem-details.js';

const tenant = randomUUID();
const otherTenant = randomUUID();
const center = randomUUID();
const otherCenter = randomUUID();
const foreignCenter = randomUUID();
const actor = randomUUID();
const testActors = [actor];
const membership = randomUUID();
const activity = randomUUID();
const slot = randomUUID();
const adjacentSlot = randomUUID();
const foreignSlot = randomUUID();
const channel = randomUUID();
const confirmed = randomUUID();
const held = randomUUID();
const expired = randomUUID();
const issuer = 'booking-read-test';
const subject = actor;
const range = { from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' };

describe('audited booking reads against PostgreSQL (DIVE-BOOK-REQ-021, 029, 043, 049; DIVE-IAM-REQ-015, 025)', () => {
  let admin: Pool;
  let runtime: Pool;
  let service: BookingReadService;
  let scope: ResolvedCenterApplicationScope;

  beforeAll(async () => {
    admin = new Pool({
      connectionString: process.env.SPIKE_ADMIN_DATABASE_URL,
      max: 2,
    });
    runtime = new Pool({
      connectionString: process.env.SPIKE_APP_DATABASE_URL,
      max: 1,
    });
    await bootstrapRoles(admin);
    await migrateProduct();
    await admin.query(
      "INSERT INTO iam_app.tenants(id,name) VALUES ($1,'Read test'),($2,'Other')",
      [tenant, otherTenant],
    );
    await admin.query(
      "INSERT INTO iam_app.centers(id,tenant_id,name,time_zone) VALUES ($1,$2,'A','Europe/Madrid'),($3,$2,'A2','Europe/Madrid'),($4,$5,'B','Europe/Madrid')",
      [center, tenant, otherCenter, foreignCenter, otherTenant],
    );
    await admin.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      actor,
    ]);
    await admin.query(
      'INSERT INTO iam_app.external_identities(identity_id,issuer,subject) VALUES ($1,$2,$3)',
      [actor, issuer, subject],
    );
    await admin.query(
      "INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids) VALUES ($1,$2,$3,'active',ARRAY['tenant_admin'],NULL)",
      [membership, tenant, actor],
    );
    for (const [tenantId, centerId, activityId] of [
      [tenant, center, activity],
      [tenant, otherCenter, randomUUID()],
      [otherTenant, foreignCenter, randomUUID()],
    ]) {
      await admin.query(
        "INSERT INTO booking_app.activities(id,tenant_id,center_id,base_locale,name,status) VALUES ($1,$2,$3,'en','{\"en\":\"Dive\"}','Published')",
        [activityId, tenantId, centerId],
      );
      const slotId =
        centerId === center
          ? slot
          : centerId === otherCenter
            ? adjacentSlot
            : foreignSlot;
      await admin.query(
        "INSERT INTO booking_app.slots(id,tenant_id,center_id,activity_id,starts_at,duration_minutes,capacity,status) VALUES ($1,$2,$3,$4,'2026-09-30T23:30:00Z',60,8,'Closed')",
        [slotId, tenantId, centerId, activityId],
      );
    }
    await admin.query(
      "INSERT INTO booking_app.channels(id,tenant_id,center_id,public_id,type,activity_id,status,allowed_origins) VALUES ($1,$2,$3,$4,'single_activity',$5,'Published',ARRAY['https://read.example.test'])",
      [channel, tenant, center, randomUUID(), activity],
    );
    for (const [bookingId, state, seats, expiry] of [
      [confirmed, 'Confirmed', 2, null],
      [held, 'Pending', 1, '2100-01-01T00:00:00.000001Z'],
      [expired, 'Pending', 3, '2000-01-01T00:00:00.000001Z'],
    ] as const) {
      await admin.query(
        `INSERT INTO booking_app.bookings
        (id,tenant_id,center_id,channel_id,slot_id,booking_channel,idempotency_key,request_hash,status,seats,locale,booker_first_name,booker_last_name,booker_email,hold_expires_at,created_at)
        VALUES ($1::uuid,$2,$3,$4,$5,'public_hosted',$1::uuid::text,'test',$6,$7,'en','First','Last','private@example.test',$8,'2026-09-01T00:00:00.000001Z')`,
        [bookingId, tenant, center, channel, slot, state, seats, expiry],
      );
    }
    scope = {
      centerId: center,
      access: await resolveIamAccess(runtime, { issuer, subject }, tenant),
    };
    service = new BookingReadService(runtime);
  });

  beforeEach(async () => {
    await admin.query('DELETE FROM iam_app.audit_records WHERE tenant_id=$1', [
      tenant,
    ]);
  });

  afterAll(async () => {
    await admin?.query('DELETE FROM booking_app.bookings WHERE tenant_id=$1', [
      tenant,
    ]);
    await admin?.query('DELETE FROM booking_app.channels WHERE tenant_id=$1', [
      tenant,
    ]);
    await admin?.query(
      'DELETE FROM booking_app.slots WHERE tenant_id IN ($1,$2)',
      [tenant, otherTenant],
    );
    await admin?.query(
      'DELETE FROM booking_app.activities WHERE tenant_id IN ($1,$2)',
      [tenant, otherTenant],
    );
    await admin?.query('DELETE FROM iam_app.audit_records WHERE tenant_id=$1', [
      tenant,
    ]);
    await admin?.query('DELETE FROM iam_app.memberships WHERE tenant_id=$1', [
      tenant,
    ]);
    await admin?.query(
      'DELETE FROM iam_app.external_identities WHERE identity_id=ANY($1::uuid[])',
      [testActors],
    );
    await admin?.query(
      'DELETE FROM iam_app.identity_tenants WHERE identity_id=ANY($1::uuid[])',
      [testActors],
    );
    await admin?.query(
      'DELETE FROM iam_app.identities WHERE id=ANY($1::uuid[])',
      [testActors],
    );
    await admin?.query(
      'DELETE FROM iam_app.centers WHERE tenant_id IN ($1,$2)',
      [tenant, otherTenant],
    );
    await admin?.query('DELETE FROM iam_app.tenants WHERE id IN ($1,$2)', [
      tenant,
      otherTenant,
    ]);
    await runtime?.end();
    await admin?.end();
  });

  it('includes cross-midnight overlap and unexpired holds without mutation or contact leakage', async () => {
    const page = await service.calendar(scope, center, range);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: slot,
      confirmedSeats: 2,
      heldSeats: 1,
      remainingSeats: null,
      status: 'Closed',
    });
    expect(page.asOf).toMatch(/\.\d{6}Z$/);
    expect(JSON.stringify(page)).not.toContain('private@example.test');
    const booking = await admin.query(
      'SELECT status FROM booking_app.bookings WHERE id=$1',
      [expired],
    );
    expect(booking.rows[0].status).toBe('Pending');
    const outside = await service.calendar(scope, center, {
      ...range,
      from: '2026-10-01T00:30:00Z',
    });
    expect(outside.items).toEqual([]);
    expect(outside.asOf).toBeTruthy();
    const audits = await admin.query(
      'SELECT action,result,purpose,resource_type FROM iam_app.audit_records WHERE tenant_id=$1',
      [tenant],
    );
    expect(audits.rows).toEqual(
      Array(2).fill({
        action: 'booking.read',
        result: 'success',
        purpose: 'calendar_operations',
        resource_type: 'center',
      }),
    );
  });

  it.each([
    ['one microsecond before', '2026-10-01T12:00:00.123455Z', 0],
    ['exactly at', '2026-10-01T12:00:00.123456Z', 0],
    ['one microsecond after', '2026-10-01T12:00:00.123457Z', 1],
  ] as const)(
    'counts a Pending hold expiring %s the coherent asOf without lifecycle writes',
    async (_boundary, expiry, expectedHeldSeats) => {
      const asOf = '2026-10-01T12:00:00.123456Z';
      const client = await runtime.connect();
      const originalQuery = client.query.bind(client);
      const spy = vi.spyOn(client, 'query');
      let observations = 0;
      spy.mockImplementation(((text: string, values?: unknown[]) => {
        if (text.includes('statement_timestamp()')) {
          observations += 1;
          return originalQuery(
            text.replaceAll('statement_timestamp()', `'${asOf}'::timestamptz`),
            values,
          );
        }
        return originalQuery(text, values);
      }) as typeof client.query);
      client.release();
      try {
        await admin.query(
          'UPDATE booking_app.bookings SET hold_expires_at=$2::timestamptz WHERE id=$1',
          [held, expiry],
        );
        const before = await admin.query(
          'SELECT to_jsonb(b) AS booking FROM booking_app.bookings b WHERE tenant_id=$1 ORDER BY id',
          [tenant],
        );
        const page = await service.calendar(scope, center, range);
        expect(observations).toBe(1);
        expect(page.asOf).toBe(asOf);
        expect(page.items).toHaveLength(1);
        expect(page.items[0]).toMatchObject({
          id: slot,
          confirmedSeats: 2,
          heldSeats: expectedHeldSeats,
          remainingSeats: null,
        });
        const after = await admin.query(
          'SELECT to_jsonb(b) AS booking FROM booking_app.bookings b WHERE tenant_id=$1 ORDER BY id',
          [tenant],
        );
        expect(after.rows).toEqual(before.rows);
        expect(
          (
            await admin.query(
              'SELECT action,result,purpose FROM iam_app.audit_records WHERE tenant_id=$1',
              [tenant],
            )
          ).rows,
        ).toEqual([
          {
            action: 'booking.read',
            result: 'success',
            purpose: 'calendar_operations',
          },
        ]);
      } finally {
        spy.mockRestore();
        await admin.query(
          "UPDATE booking_app.bookings SET hold_expires_at='2100-01-01T00:00:00.000001Z' WHERE id=$1",
          [held],
        );
      }
    },
  );

  it('observes one coherent occupancy/asOf while a concurrent status/seat transaction commits', async () => {
    const writer = await admin.connect();
    const client = await runtime.connect();
    const originalQuery = client.query.bind(client);
    const spy = vi.spyOn(client, 'query');
    let observations = 0;
    let beforeCommitAsOf = '';
    spy.mockImplementation((async (text: string, values?: unknown[]) => {
      const result = await originalQuery(text, values);
      if (text.includes('statement_timestamp()')) {
        observations += 1;
        if (observations === 1) {
          const barrier = await writer.query(
            `SELECT to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS instant`,
          );
          beforeCommitAsOf = barrier.rows[0].instant;
          await writer.query('COMMIT');
        }
      }
      return result;
    }) as typeof client.query);
    client.release();
    try {
      await writer.query('BEGIN');
      await writer.query(
        `UPDATE booking_app.bookings
         SET status=CASE WHEN id=$1 THEN 'Pending' ELSE 'Confirmed' END,
             seats=CASE WHEN id=$1 THEN 4 ELSE 3 END,
             hold_expires_at='2100-01-01T00:00:00.000001Z'
         WHERE tenant_id=$3 AND id IN ($1,$2)`,
        [confirmed, held, tenant],
      );
      const started = await writer.query(
        `SELECT to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS instant`,
      );
      const page = await service.calendar(scope, center, range);
      expect(observations).toBe(1);
      expect(page.asOf >= started.rows[0].instant).toBe(true);
      expect(page.asOf <= beforeCommitAsOf).toBe(true);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        id: slot,
        confirmedSeats: 2,
        heldSeats: 1,
        remainingSeats: null,
      });
      const committed = await admin.query(
        'SELECT to_jsonb(b) AS booking FROM booking_app.bookings b WHERE tenant_id=$1 ORDER BY id',
        [tenant],
      );
      expect(
        committed.rows.find((row) => row.booking.id === confirmed)?.booking,
      ).toMatchObject({ status: 'Pending', seats: 4 });
      expect(
        committed.rows.find((row) => row.booking.id === held)?.booking,
      ).toMatchObject({ status: 'Confirmed', seats: 3 });
      const refreshed = await service.calendar(scope, center, range);
      expect(observations).toBe(2);
      expect(refreshed.asOf >= beforeCommitAsOf).toBe(true);
      expect(refreshed.items).toHaveLength(1);
      expect(refreshed.items[0]).toMatchObject({
        id: slot,
        confirmedSeats: 3,
        heldSeats: 4,
        remainingSeats: null,
      });
      expect(
        (
          await admin.query(
            'SELECT to_jsonb(b) AS booking FROM booking_app.bookings b WHERE tenant_id=$1 ORDER BY id',
            [tenant],
          )
        ).rows,
      ).toEqual(committed.rows);
      expect(
        (
          await admin.query(
            'SELECT action,result,purpose FROM iam_app.audit_records WHERE tenant_id=$1',
            [tenant],
          )
        ).rows,
      ).toEqual(
        Array(2).fill({
          action: 'booking.read',
          result: 'success',
          purpose: 'calendar_operations',
        }),
      );
    } finally {
      spy.mockRestore();
      await writer.query('ROLLBACK');
      try {
        await writer.query(
          `UPDATE booking_app.bookings
           SET status=CASE WHEN id=$1 THEN 'Confirmed' ELSE 'Pending' END,
               seats=CASE WHEN id=$1 THEN 2 ELSE 1 END,
               hold_expires_at=CASE WHEN id=$1 THEN NULL ELSE '2100-01-01T00:00:00.000001Z'::timestamptz END
           WHERE tenant_id=$3 AND id IN ($1,$2)`,
          [confirmed, held, tenant],
        );
      } finally {
        writer.release();
      }
    }
  });

  it('paginates bookings in stable creation/ID order without exposing contacts', async () => {
    const ids = [confirmed, held, expired].sort();
    const first = await service.bookings(scope, center, slot, {
      pageSize: '2',
    });
    const second = await service.bookings(scope, center, slot, {
      pageSize: '2',
      page: '2',
    });
    expect(first.items.map((item) => item.bookingId)).toEqual(ids.slice(0, 2));
    expect(first.hasNext).toBe(true);
    expect(second.items.map((item) => item.bookingId)).toEqual(ids.slice(2));
    expect(second.hasNext).toBe(false);
    expect(JSON.stringify(first)).not.toContain('private@example.test');
    const pending = await service.bookings(scope, center, slot, {
      bookingStatus: 'Pending',
    });
    expect(pending.items).toHaveLength(2);
    expect(
      pending.items.find((item) => item.bookingId === held)?.holdExpiresAt,
    ).toBe('2100-01-01T00:00:00.000001Z');
    const calendar = await service.calendar(scope, center, range);
    expect(calendar.items[0]).toMatchObject({
      confirmedSeats: 2,
      heldSeats: 1,
    });
  });

  it('preserves explicit-zone overlap across the daylight-saving transition', async () => {
    const transitionSlot = randomUUID();
    await admin.query(
      "INSERT INTO booking_app.slots(id,tenant_id,center_id,activity_id,starts_at,duration_minutes,capacity,status) VALUES ($1,$2,$3,$4,'2026-10-25T00:30:00Z',90,8,'Available')",
      [transitionSlot, tenant, center, activity],
    );
    const page = await service.calendar(scope, center, {
      from: '2026-10-25T02:15:00+02:00',
      to: '2026-10-25T02:45:00+01:00',
      slotStatus: 'Available',
      activityId: activity,
    });
    expect(page.items.map((item) => item.id)).toEqual([transitionSlot]);
    const boundary = await service.calendar(scope, center, {
      from: '2026-10-25T03:00:00+01:00',
      to: '2026-10-25T04:00:00+01:00',
    });
    expect(boundary.items).toEqual([]);
  });

  it('accepts RFC3339 offsets without relying on PostgreSQL timezone-displacement limits', async () => {
    const page = await service.calendar(scope, center, {
      from: '2026-10-01T23:00:00+23:00',
      to: range.to,
    });
    expect(page.items.map((item) => item.id)).toEqual([slot]);
    const beforeCommonEra = await service.calendar(scope, center, {
      from: '0001-01-01T00:00:00+23:00',
      to: '0001-01-02T00:00:00Z',
    });
    expect(beforeCommonEra.items).toEqual([]);
    const extendedYear = await service.calendar(scope, center, {
      from: '9999-12-31T00:00:00-23:00',
      to: '9999-12-31T23:59:59-23:00',
    });
    expect(extendedYear.items).toEqual([]);
  });

  it('does not manufacture audits for invalid input and does not broaden inaccessible activity filters', async () => {
    await expect(
      service.calendar(scope, center, { ...range, slotStatus: 'Pending' }),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      (
        await admin.query(
          'SELECT id FROM iam_app.audit_records WHERE tenant_id=$1',
          [tenant],
        )
      ).rows,
    ).toEqual([]);
    await expect(
      service.calendar(scope, center, { ...range, activityId: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await admin.query(
          'SELECT result FROM iam_app.audit_records WHERE tenant_id=$1',
          [tenant],
        )
      ).rows,
    ).toEqual([{ result: 'denied' }]);
  });

  it('returns contacts only with one committed purpose-limited audit record', async () => {
    expect(await service.contact(scope, center, confirmed, {})).toEqual({
      bookingId: confirmed,
      booker: {
        firstName: 'First',
        lastName: 'Last',
        email: 'private@example.test',
        phone: null,
      },
    });
    const audit = await admin.query(
      'SELECT action,purpose,result,source_metadata FROM iam_app.audit_records WHERE tenant_id=$1',
      [tenant],
    );
    expect(audit.rows).toEqual([
      {
        action: 'customer_contact.read',
        purpose: 'booking_operations',
        result: 'success',
        source_metadata: { centerId: center, slotId: slot },
      },
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain('private@example.test');
  });

  it('exposes the approved HTTP shapes and private no-store response policy', async () => {
    const module = await Test.createTestingModule({
      controllers: [BookingReadController],
      providers: [{ provide: BookingReadService, useValue: service }],
    }).compile();
    const app = module.createNestApplication();
    app.use(
      (
        incoming: Request & {
          applicationScope?: ResolvedCenterApplicationScope;
        },
        _response: Response,
        next: NextFunction,
      ) => {
        incoming.applicationScope = scope;
        next();
      },
    );
    app.useGlobalFilters(new ApiProblemFilter());
    await app.init();
    try {
      const calendar = await request(app.getHttpServer())
        .get(`/v1/centers/${center}/calendar/slots`)
        .query(range)
        .expect(200);
      const bookings = await request(app.getHttpServer())
        .get(`/v1/centers/${center}/slots/${slot}/bookings`)
        .expect(200);
      const contact = await request(app.getHttpServer())
        .get(`/v1/centers/${center}/bookings/${confirmed}/contact`)
        .expect(200);
      for (const response of [calendar, bookings, contact])
        expect(response.headers['cache-control']).toBe('private, no-store');
      expect(calendar.body.items).toHaveLength(1);
      expect(bookings.body.items).toHaveLength(3);
      expect(JSON.stringify([calendar.body, bookings.body])).not.toContain(
        'private@example.test',
      );
      expect(contact.body.booker.email).toBe('private@example.test');
      const invalid = await request(app.getHttpServer())
        .get(`/v1/centers/${center}/calendar/slots`)
        .query({ ...range, page: 'invalid' })
        .expect(422);
      expect(invalid.body.code).toBe('validation_error');
    } finally {
      await app.close();
    }
  });

  it('rejects cross-center and cross-tenant resources with durable denial audits (MT-REQ-009, 010)', async () => {
    for (const requestedSlot of [adjacentSlot, foreignSlot]) {
      await expect(
        service.bookings(scope, center, requestedSlot, {}),
      ).rejects.toMatchObject({ status: 404 });
    }
    await expect(
      service.calendar(scope, otherCenter, range),
    ).rejects.toMatchObject({ status: 404 });
    const audit = await admin.query(
      'SELECT result,reason FROM iam_app.audit_records WHERE tenant_id=$1',
      [tenant],
    );
    expect(audit.rows).toHaveLength(3);
    expect(audit.rows.every((row) => row.result === 'denied')).toBe(true);
  });

  it('rechecks assigned-center scope and fails closed for unaffiliated principals', async () => {
    const deniedActor = randomUUID();
    testActors.push(deniedActor);
    const deniedMembership = randomUUID();
    await admin.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      deniedActor,
    ]);
    await admin.query(
      'INSERT INTO iam_app.external_identities(identity_id,issuer,subject) VALUES ($1::uuid,$2,$1::uuid::text)',
      [deniedActor, issuer],
    );
    await admin.query(
      "INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids) VALUES ($1,$2,$3,'active',ARRAY['center_manager'],ARRAY[$4::uuid])",
      [deniedMembership, tenant, deniedActor, otherCenter],
    );
    const deniedScope = {
      centerId: center,
      access: await resolveIamAccess(
        runtime,
        { issuer, subject: deniedActor },
        tenant,
      ),
    };
    await expect(
      service.contact(deniedScope, center, confirmed, {}),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.contact(
        { ...scope, access: { ...scope.access, subject: 'unaffiliated' } },
        center,
        confirmed,
        {},
      ),
    ).rejects.toMatchObject({ status: 401 });
    const audits = await admin.query(
      'SELECT result,reason FROM iam_app.audit_records WHERE tenant_id=$1',
      [tenant],
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]).toMatchObject({ result: 'denied' });
  });

  it.each(['audit', 'commit'])(
    'suppresses contacts on %s failure and restores pooled context (MT-REQ-005)',
    async (failure) => {
      const client = await runtime.connect();
      const originalQuery = client.query.bind(client);
      const spy = vi.spyOn(client, 'query');
      spy.mockImplementation(((text: string, values?: unknown[]) => {
        if (
          (failure === 'audit' && text.includes('record_booking_read')) ||
          (failure === 'commit' && text === 'COMMIT')
        )
          return Promise.reject(new Error('Read transaction unavailable'));
        return originalQuery(text, values);
      }) as typeof client.query);
      client.release();
      try {
        await expect(
          service.contact(scope, center, confirmed, {}),
        ).rejects.toThrow('Read transaction unavailable');
      } finally {
        spy.mockRestore();
      }
      expect(
        (
          await admin.query(
            'SELECT id FROM iam_app.audit_records WHERE tenant_id=$1',
            [tenant],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await runtime.query(
            "SELECT current_setting('app.tenant_id',true) AS context",
          )
        ).rows[0].context ?? '',
      ).toBe('');
    },
  );
});
