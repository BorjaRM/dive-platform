import { handlePlatformInvitationBff } from '../../../../../lib/dashboard-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ invitationId?: string[] }> };

async function handle(request: Request, context: Context) {
  const { invitationId = [] } = await context.params;
  return handlePlatformInvitationBff(request, [
    'v1',
    'platform',
    'bootstrap-invitations',
    ...invitationId,
  ]);
}

export const GET = handle;
export const POST = handle;
export const HEAD = handle;
export const OPTIONS = handle;
