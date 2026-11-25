# Selected PR evidence dossier

From a work item, confirm its PR link, choose context, then check **PR evidence: URL**. Preview collects one dated dossier alongside any selected local sections, notes or documents. Nothing is preselected. The UI displays the SHA and source availability; inspect the complete paginated Markdown/JSON preview before copying it. This is observation, not merge authorization or proof that the work is complete.

## Shared contract

Desktop, CLI and MCP use the existing `work_context` operation with the additive `selection.prUrls` field:

```sh
worklens work context --repo /path/to/repo --params '{"id":"task-42","expectedRevision":7,"selection":{"sections":["summary","decisions"],"prUrls":["https://github.com/owner/repository/pull/123"]},"limit":30,"maxBytes":200000}'
```

MCP: `worklens_query`, operation `work_context`, with identical parameters. Read `work_show` first to obtain the current revision. Follow `nextOffset` using `work_context_page` and the same snapshot ID. Pagination does not recollect GitHub or mix new observations into an old dossier. JSON and safely fenced Markdown share the same contents and sources.

The URL must exactly match a confirmed PR link. Only canonical `https://github.com/owner/repository/pull/number` URLs are accepted: no credentials, query strings, fragments, redirects or arbitrary hosts. One PR per snapshot; additional PRs require separate dossiers. Selecting a link reference alone does not opt into GitHub reads.

## Records and consistency

- `pr_evidence`: base/head SHAs, base/head repository identities, expected/collected file counts, collection warnings and final verification time.
- `pr_file`: changed path/status and old path for renames, not patch contents.
- `pr_impact`, `pr_impact_direct`, `pr_impact_dependant`: reachability from the cached local catalog, with unmatched/transversal paths and graph source dates. **Always approximate**: the cached graph is not verified against the PR SHA. No Git fetch, manifest installation or Nx/plugin execution occurs during export. Collect Architecture explicitly beforehand; otherwise impact is unavailable while other evidence remains usable.
- `pr_validations`, `pr_expectation`, `pr_validation`: local expectations from the selected work revision, assessments and observed checks/statuses at the exact head SHA in the **base repository**. Fork and synthetic merge-commit checks are not silently combined. Missing, unknown, ambiguous and unsuccessful results remain distinct. Source failures never prove an expectation satisfied.

Every evidence record carries its PR URL, head SHA and provenance. File collection checks PR base/head identities before and after pagination; the dossier checks them again after collecting validations. Changed or unverifiable PR revisions discard that PR dossier and produce an explicit unavailable record. Selected local context remains usable. A work revision changed during collection rejects the whole snapshot, requiring a reload.

GitHub observations are not globally atomic: checks can be rerun or change after collection, and a PR can move after the last verification. Partial file/control collections retain explicit availability and limits, not a complete-evidence claim. There is no automatic completion, merge gate, CI trigger or GitHub write.

## Bounds and privacy

Existing collector limits apply: up to 3,000 PR files and 1,000 observations per validation source; a 90-second asynchronous dossier deadline. The existing native Keychain authorization can still require manual system interaction. Authentication/access failures are reported without exporting credentials.

Existing [snapshot bounds](work-context.md) apply: 100 selections, 2 MB per snapshot, up to 200 KB per serialized page, four in-memory snapshots retained for 15 minutes. An oversized dossier fails explicitly rather than truncating records; very large dossiers may not fit this alpha. No durable dossier table or inspected-repository file is written. GitHub client response caching is unchanged.

No discussions, comments, logs, conversation transcripts, patches or tokens are exported. Paths, check names and selected local text may still be sensitive: review before sharing. Upgrade desktop and CLI together and restart the shared service; database schema remains 4.
