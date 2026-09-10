# GitHub App setup

The community build has no hard-coded app registration. A repository administrator must create a GitHub App before real authentication can be accepted.

1. Register a GitHub App under the intended user or organization.
2. Enable **Device Flow**. Disable webhook delivery; Worklens runs locally and has no webhook endpoint.
3. Set repository permissions to **Read-only**: Metadata, Contents, Issues, Pull requests, Actions, Checks and Commit statuses. No organization/account permissions are required by this alpha.
4. Install the app on **Only select repositories** and choose a test repository. The authenticating user must also have access to it.
5. Copy the public **Client ID**, not the numeric App ID, into Worklens → Settings → GitHub.
6. Start connection, open GitHub's device authorization page, enter the displayed code, and authorize the application yourself.

No client secret or private key is embedded or requested by Worklens. The device code stays in service memory. The resulting user token is stored in macOS Keychain under service `dev.worklens.github`, account `github.com`. SQLite stores only the public Client ID and observed data. Token expiration or revoked authorization requires an explicit reconnection; refresh tokens are not retained.

Only `github.com` / `api.github.com` are supported. Enterprise hosts are not part of this alpha. Repository selection is limited by the intersection of user access and app installation permissions. SSO organizations may require an active SSO session before authorization.

The active desktop polls visible GitHub list views every 60 seconds, pausing background polling. Detail/log requests occur when those views are opened. ETags are reused when returned, and primary rate limits / Retry-After defer requests. Previously cached snapshots can remain visible with a stale warning when connectivity or authorization fails. Disconnect removes the token; local cached repository data remains until the user removes local data.

## Real acceptance recipe

- Open a test repository and authenticate through the device code.
- Select a PR with a local matching worktree; verify head repository and branch.
- Compare the displayed SHA with GitHub, inspect all file pages, reviews and inline comments.
- Open checks/workflow details for that SHA, one job log, and the artifact link.
- Revoke authorization from GitHub, refresh and verify the explicit reconnection message.
- Reconnect and repeat with a fork PR to confirm it is not merged with the base repository.

This recipe must be performed with an actual registered app. Mocked HTTP/browser tests are not evidence of a successful live authorization.

Source: [GitHub App user tokens and Device Flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), consulted 2026-09-10.
