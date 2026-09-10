# Local work items

Work items are local objectives, not copies of GitHub issues. Create one from Work items, a PR, an issue, a worktree or an agent. Supply a title, objective and optional result criteria. No GitHub comments, branch changes or task execution occur.

## Semantics

- States: `todo`, `in_progress`, `waiting`, `blocked`, `completed`, `abandoned`. Every state change is explicit, including reopening. Finishing an agent or merging a PR never changes a work item's state.
- Links: `pr`, `issue`, `worktree`, `agent`, `component`. Store several links of each type. Worktree/agent/component references must belong to the selected repository. GitHub references preserve the exact owner/repository, including forks, and are declared links rather than evidence of access.
- `candidate` links can be confirmed or rejected. `confirmed` means explicitly declared, not independently authenticated or verified. Removing a link retains its history; source objects are unchanged.
- Actor attribution is caller-supplied. This local alpha has no multi-user authentication boundary. Notes and history are untrusted source text and are never GitHub comments.
- `expectedRevision` is mandatory: zero for creation, otherwise the last read revision. Conflicts reject the whole change; reload, reconcile your edit and retry explicitly.
- Reuse an identical `eventId` and payload after an uncertain result. Identical retries return `applied:false` and the current item; a changed payload with the same event ID fails. All changes and events commit atomically.
- Lists and history paginate by `offset`, 50 records per page. Follow `nextOffset`. Lists support optional `state` and exact linked `reference` filters. History is newest first.
- Each item is limited to 128 KB and 100 links. Title: 200 bytes; objective: 8,192; criteria: 16,384; note: 8,192; reference/reason: 2,048 each. The engine enforces UTF-8 byte limits.

## CLI

Open the repository first and use its absolute path with `--repo`. Examples use stable caller-owned IDs for clarity:

```sh
worklens work create --repo /path/to/repo --params '{"id":"task-42","eventId":"create-42","actor":"my-agent (declared)","expectedRevision":0,"change":{"action":"create","title":"Verify delivery","objective":"Connect the PR to its worktree and validations","criteria":"References are inspectable","links":[{"kind":"pr","reference":"https://github.com/owner/repo/pull/42","status":"confirmed","reason":"Explicit task scope"}]}}'
worklens work list --repo /path/to/repo --params '{"state":"todo","offset":0}'
worklens work show --repo /path/to/repo --params '{"id":"task-42","offset":0}'
worklens work link --repo /path/to/repo --params '{"id":"task-42","eventId":"link-42","actor":"my-agent (declared)","expectedRevision":1,"change":{"action":"link","link":{"kind":"agent","reference":"session-42","status":"candidate","reason":"Request human confirmation"}}}'
worklens work note --repo /path/to/repo --params '{"id":"task-42","eventId":"note-42","actor":"my-agent (declared)","expectedRevision":2,"change":{"action":"note","text":"Waiting for review; no action executed"}}'
worklens work update --repo /path/to/repo --params '{"id":"task-42","eventId":"update-42","actor":"desktop user (declared)","expectedRevision":3,"change":{"action":"update","title":"Verify delivery","objective":"Connect the PR to its worktree and validations","criteria":"References are inspectable","state":"waiting"}}'
worklens work unlink --repo /path/to/repo --params '{"id":"task-42","eventId":"unlink-42","actor":"desktop user (declared)","expectedRevision":4,"change":{"action":"unlink","kind":"agent","reference":"session-42"}}'
```

The agent in the link example must already have declared a session in this repository. Update replaces title, objective, criteria and state together. Linking the same kind/reference changes its status/reason rather than creating a duplicate.

## MCP

- `worklens_query`: `operation: "work_list"` or `"work_show"`, with `repository` and read params.
- `worklens_work`: `operation: "work_create"`, `"work_update"`, `"work_link"`, `"work_unlink"`, `"work_note"`. `params` is exactly the typed mutation JSON used by the CLI above.
- Work mutations are not exposed through the read tool. The existing agent reporting tool still changes only session declarations.

## Storage and upgrade

Database schema 2 adds work items and append-only work events without changing existing repositories, settings, agents or cached observations. Newer database versions are rejected. The protocol gains additive operations; old service binaries cannot handle them. Use matching desktop/CLI binaries and restart the existing Worklens background `serve` process when upgrading from the initial alpha. No system service is installed.

## Delivery boundary

This increment supplies the work-item lifecycle, explicit associations, notes, history and source-entry navigation. It does not yet aggregate all remote details into the work item, automatically suggest links, collect complete PR impact, track validation expectations, exchange structured decisions or export work-specific context. Those remain the following functional increments. Existing PR/worktree heuristics are not treated as confirmed work-item links.
