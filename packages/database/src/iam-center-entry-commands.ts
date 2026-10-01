import type { IamDenialReason } from '@dive-center/contracts';
import type { Pool } from 'pg';
import type { IamAccessContext } from './iam-authorize.js';

type CenterEntryStatus = 'active' | 'disabled';

type CenterEntryStatusCommandResult =
  | Readonly<{ deniedReason: IamDenialReason }>
  | Readonly<{ changed: boolean; status: CenterEntryStatus }>;

export async function setIamCenterEntryStatus(
  pool: Pool,
  context: Pick<IamAccessContext, 'tenantId' | 'issuer' | 'subject'>,
  input: Readonly<{
    centerId: string;
    status: CenterEntryStatus;
    purpose: string;
    correlationId: string;
  }>,
): Promise<CenterEntryStatusCommandResult> {
  const result = await pool.query<{
    outcome: CenterEntryStatusCommandResult;
  }>(
    `SELECT iam_app.set_center_entry_status_command(
      $1, $2, $3::uuid, $4::uuid, $5, $6, $7::uuid
    ) AS outcome`,
    [
      context.issuer,
      context.subject,
      context.tenantId,
      input.centerId,
      input.status,
      input.purpose,
      input.correlationId,
    ],
  );
  const outcome = result.rows[0]?.outcome;
  if (!outcome)
    throw new Error('Center entry status command returned no outcome');
  return Object.freeze(outcome);
}

export type { CenterEntryStatus, CenterEntryStatusCommandResult };
