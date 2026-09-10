# Selected work context

From a work item, choose **Choose context**, select the information to include, then **Preview work context**. Nothing is selected by default. Preview the saved work revision and each source before copying the current page as Markdown or JSON. Changing the selection clears the old preview. Unsaved work fields/decisions/expectations must be saved before starting a new export.

## Selection and source boundaries

- `sections`: `summary` (title, objective, criteria, state), `links` (declared references and their candidate/confirmed/rejected status), `decisions` (requests and outcomes), `expectations` (local criteria, **not CI results**). Each section includes only its own data, not an entire hidden work item.
- `projectIds`, `agentIds`, `worktreePaths`: explicit selections from **confirmed links** on this work item. Candidate links can be exported as references with `links`, but do not authorize source expansion. Foreign/unlinked identifiers reject the selection.
- `documentPaths`: explicitly selected README/ADR/instruction documents from the selected repository/worktree index. These documents are not implicitly associated with the task. Absolute paths, path escapes, external symlinks and non-indexed documents do not expose file contents.
- Projects use the already-collected catalog, marked stale with its original provenance. Export never invokes Nx/plugins or installs dependencies. If no cached catalog is available, collect it explicitly in Architecture first.
- Agent data includes caller-declared state and presence, not conversations. Worktree records include path, branch, HEAD and changed-file status, not remotes, diffs or commit messages.
- No GitHub network requests, keychain reads, PR discussions, CI logs, hidden conversations, notes or full history are included. PR/issue links are references only. Remote evidence packets and individual note selection are not part of this increment.

Each record carries sources, dates and availability. An unavailable linked source/document becomes an explicit `data:null` record with an unavailable source; other selected records remain usable. Local work is read at a checked revision and checked again after collection. Git/document/agent observations have their own collection context and are **not** a globally atomic repository snapshot. Selected user-authored text can itself contain sensitive material: review before sharing. Actor names and decisions are not authenticated human approvals.

## CLI and MCP

Read the work item first to obtain its current revision. For a work item at revision 7:

```sh
worklens work context --repo /path/to/repo --params '{"id":"task-42","expectedRevision":7,"selection":{"sections":["summary","decisions"],"documentPaths":["README.md"]},"limit":30,"maxBytes":200000}'
```

The response includes `snapshotId`, `workRevision`, `collectedAt`, `expiresAt`, `items`, `total`, `offset`, `nextOffset`, warnings and `markdown`. Follow `nextOffset` with **the same snapshot ID**; do not start a new export for each page:

```sh
worklens work context-page --repo /path/to/repo --params '{"snapshotId":"ID_FROM_RESPONSE","offset":30,"limit":30,"maxBytes":200000}'
worklens work context-page --repo /path/to/repo --params '{"snapshotId":"ID_FROM_RESPONSE","offset":0,"limit":30,"maxBytes":200000}' --format markdown
```

Use the actual returned offset, which may be smaller than the requested limit because of byte limits. CLI stdout can be redirected explicitly to a destination you choose. Desktop copying exports **only the displayed page**, and labels remaining pages. A complete transfer requires following every `nextOffset` to null. An empty selected section can produce zero records without implying missing source data.

MCP `worklens_query` exposes `work_context` and `work_context_page` with identical params. They are not work mutations. Desktop, CLI and MCP can read the same snapshot through the shared service. Markdown contains a safely fenced JSON packet with the same sources, limits and continuation metadata, not executable instructions.

## Bounds and lifetime

- At most 100 section/source selections; duplicate entries are rejected.
- `limit`: 1–100 records, default 30. `maxBytes`: 4,096–200,000 bytes, default 200,000. The budget covers the actual pretty JSON CLI page including the Markdown field and final newline; transport/MCP wrappers are additional overhead.
- Records are never silently truncated to fit a page. If one record exceeds the page budget, increase the budget or choose a smaller selection/document. Documents retain the existing 128-KB read limit; an oversized document is explicitly unavailable. An individually readable document can still exceed the serialized export budget because JSON/Markdown add overhead.
- Maximum snapshot size: 2 MB. A larger selection fails explicitly. Only four snapshots are retained in service memory; newer exports evict older ones. IDs cease to be readable after 15 minutes or a service restart. Expired memory entries are pruned on subsequent context operations; there is no persistent export table or file.
- Snapshot pages retain their collected state even if the work item, agent or document later changes. They are bound to the original repository **and worktree path**. Expired/evicted/restarted/foreign snapshots fail explicitly: make a fresh selection/export, never silently combine them.

The feature adds protocol operations without changing database schema 4. Upgrade CLI and desktop together and restart the shared service. Export does not write into the inspected repository or alter work history.
