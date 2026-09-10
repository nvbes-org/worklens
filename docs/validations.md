# Validation center

Read validations from a PR detail or a linked PR in a work item. The service reads
GitHub check runs and commit statuses for the displayed **exact SHA**. There is no
CI trigger, rerun, cancellation, branch-policy edit or automatic work completion.

## Local expectations

In a work item, add expectations by repository (`owner/repo`), kind (`check` or
`status`) and exact control name. Optionally pin a check to a GitHub App ID.
These are local criteria, **not** GitHub branch protection, rulesets, required
workflows or a mergeability verdict. Expectations for other repositories are not
applied to this repository's report. No expectations means `not_configured`, not
success. Matrix jobs with different names require distinct expectations.

Expectations are stored in the work item with the same event deduplication,
actor attribution, revision check and history as other edits. Updating expectations
does not change the work state or the associated agent state. The desktop protects
an expectation draft from competing field/link/note mutations. Reload discards it.

```sh
worklens work expectations --repo /absolute/repository --params '{"id":"work-1","eventId":"expect-1","actor":"human (declared)","expectedRevision":2,"change":{"action":"expectations","expectations":[{"repository":"owner/repo","kind":"check","name":"validate","appId":15368}]}}'
worklens validations --repo /absolute/repository --params '{"number":12,"workId":"work-1"}'
worklens validations --repo /absolute/repository --params '{"slug":"owner/repo","sha":"0123456789012345678901234567890123456789","workId":"work-1"}'
```

`work expectations` replaces the complete list; preserve entries you still want.
At most 100 expectations, 200 bytes per name/repository, positive optional App ID
within JavaScript's safe integer range. A status expectation cannot specify an App
ID. MCP exposes the read through `worklens_query` (`validations`) and the mutation
through `worklens_work` (`work_expectations`) with the same params.

Database schema 3 preserves schema 1/2 data and reads old work items with an empty
expectation list. Older builds refuse the upgraded database rather than silently
dropping new fields. Restart the old service before using this build. Do not
downgrade against this database; keep backups outside the active data directory.

## Evidence and outcomes

Both collectors page independently, up to 100 records per page and 1,000 controls
per source, with a 45-second deadline each. A missing page, changing total count,
duplicate ID, malformed record or wrong SHA makes that source partial/unavailable.
The other source remains usable. A partial source cannot satisfy its expectations,
even if the available first page is green. Sources carry timestamps and the SHA.

Checks use GitHub's `filter=latest`; statuses use the combined-status endpoint's
current contexts. See [check runs](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference)
and [combined statuses](https://docs.github.com/en/rest/commits/statuses#get-the-combined-status-for-a-specific-reference).
The API's check-suite visibility limits also apply; this is not an exhaustive audit
of historical runs. Pagination is not a transactional snapshot of mutable CI state.

Only explicit `success` satisfies a criterion. Pending, failure, cancelled, skipped,
neutral, timed out and action required remain distinct. No matching record is
`missing` only when its source was completely collected; otherwise it is `unknown`.
Multiple matching records are `ambiguous`; Worklens does not choose an arbitrary
green result. App pinning can disambiguate producers, but not duplicate names within
one producer. Raw observations retain their IDs and reported states for inspection.

Reports show `satisfied`, `attention`, `unknown` or `not_configured` for **declared
expectations only**. Additional observed failures remain visible but are not silently
added to the user's expectation policy. Reports are on-demand snapshots, not a
persisted CI history. Refresh after new commits or reruns. A PR-number request samples
its head when collection begins; an explicit SHA query never follows the branch.
The selected repository, fork repository and synthetic merge SHA are not combined.

Automatic expectations from branch protection, manual validation attestations,
cross-repository policy reconciliation and structured decisions remain future scope.
