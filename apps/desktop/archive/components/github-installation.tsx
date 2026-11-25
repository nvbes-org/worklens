import { useMutation } from '@tanstack/react-query';
import { openUrl, query } from '../lib/api';
import { ErrorNotice } from './common';
import { Button } from './ui/button';

export const WORKLENS_CLIENT_ID = 'Iv23lifQ5XbUSLUf4ynB';
const INSTALL_URL = 'https://github.com/apps/worklens-by-nvbes/installations/new';

export function GitHubInstallation({
  clientId,
  connected,
  repository,
}: {
  clientId: string;
  connected: boolean;
  repository: string | null;
}) {
  const install = useMutation({ mutationFn: () => openUrl(INSTALL_URL) });
  const access = useMutation({
    mutationFn: async () => {
      const result = await query<{ provenance: { status: string; detail: string | null } }>(
        'prs',
        repository,
        { state: 'open', page: 1 },
      );
      if (result.provenance.status !== 'available') {
        throw new Error(result.provenance.detail || 'Only cached data is available. Access is not verified.');
      }
      return true;
    },
  });
  return (
    <div className="mt-5 border-t pt-5">
      <h3 className="text-sm font-medium">Repository access</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Install Worklens by nvbes on GitHub, choose your account or organization, then select the repositories
        to observe. Approve permissions on GitHub and return here to verify access.
      </p>
      {clientId !== WORKLENS_CLIENT_ID && (
        <p className="mt-2 text-sm text-muted-foreground">
          A different GitHub App is configured. Install that app from its own GitHub page.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={install.isPending || clientId !== WORKLENS_CLIENT_ID}
          onClick={() => install.mutate()}
        >
          Install / configure GitHub access
        </Button>
        <Button
          variant="outline"
          disabled={!connected || !repository || access.isPending}
          onClick={() => access.mutate()}
        >
          {access.isPending ? 'Checking access…' : 'Verify repository access'}
        </Button>
      </div>
      <ErrorNotice error={install.error || access.error} />
      {access.isSuccess && (
        <p role="status" className="mt-3 text-sm">
          Pull request access verified for {repository}. This does not verify every GitHub permission.
        </p>
      )}
    </div>
  );
}
