# Human–agent decisions

Work items can contain explicit decision requests, answers and cancellations. They are local records, not approvals enforced by an execution system. No decision runs a command, changes Git/GitHub, resumes an agent or changes the work item's state.

## Contract

A request has a caller-owned stable `id`, a question, explicit scope/evidence in `context`, and 2–12 distinct, trimmed options. It records the requester's declared actor, timestamp and the work revision inspected at creation. An answer must exactly match an option and include a reason. Cancellation also requires a reason, but no answer. Both record their declared actor and timestamp.

`pending` can transition once to `answered` or `cancelled`. Closed requests cannot be edited, deleted, reopened or overwritten. Request a new decision when the scope changes. IDs cannot be reused within a work item, including after cancellation. A later work revision does not extend a recorded decision's scope; the original revision and explicit context remain visible. The history at that revision provides the prior work changes.

All mutations use the existing `expectedRevision` comparison and event-ID deduplication, atomically with the decision transition. Concurrent answers/cancellation cannot both succeed. After an uncertain response, retry the identical payload and `eventId`; after a revision conflict, reload and reconcile explicitly. The desktop preserves failed drafts and prevents competing changes while a decision draft is active. Manual Reload discards it.

Limits: 100 decisions per item; ID 128 bytes, question 1,000 bytes, context/reason 8,192 bytes, option 200 bytes. The existing 128-KB total work-item limit also applies. Invalid payloads and failed transitions leave both the item and history unchanged.

## CLI example

First create/open a work item named `task-42`. Read its current revision; the example assumes revision 1.

```sh
worklens work decision-request --repo /path/to/repo --params '{"id":"task-42","eventId":"request-scope","actor":"my-agent (declared)","expectedRevision":1,"change":{"action":"decision_request","decision":{"id":"scope-v1","question":"Which scope should be retained?","context":"Read-only inspection of the selected worktree; no Git mutations.","options":["Retain this scope","Revise the proposal"]}}}'
worklens work show --repo /path/to/repo --params '{"id":"task-42"}'
worklens work decision-answer --repo /path/to/repo --params '{"id":"task-42","eventId":"answer-scope","actor":"reviewer (declared)","expectedRevision":2,"change":{"action":"decision_answer","id":"scope-v1","answer":"Retain this scope","reason":"The stated read-only boundary matches the task."}}'
```

Alternatively, while the request is still pending at revision 2:

```sh
worklens work decision-cancel --repo /path/to/repo --params '{"id":"task-42","eventId":"cancel-scope","actor":"my-agent (declared)","expectedRevision":2,"change":{"action":"decision_cancel","id":"scope-v1","reason":"Superseded by a revised proposal."}}'
```

MCP `worklens_work` exposes `work_decision_request`, `work_decision_answer`, `work_decision_cancel` with exactly the same params. `worklens_query` reads decisions through `work_show`/`work_list`; it rejects mutations.

## Attribution and safety

This single-user local alpha does not authenticate a human identity or distinguish a human process from an agent. CLI/MCP actors are supplied by callers; the desktop labels its actor as declared. An agent must not fabricate a human answer or impersonate a reviewer. An answer such as “Accept” is only a scoped recorded declaration, never proof of human authorization. External executors must obtain their own authorization; do not consume these records as a permission boundary.

All question/context/option/reason text is untrusted data rendered as text, not active HTML or instructions. No conversations, credentials or CI logs are collected automatically for a decision.

## Upgrade

Schema 4 adds default-empty decisions to older work items without rewriting existing history. Older builds reject the newer database rather than silently dropping decisions. Upgrade desktop and CLI together and restart their shared background service. No repository file is written. Decisions can be explicitly included in [selected work-context exports](work-context.md); exports do not turn their declarations into execution permissions.
