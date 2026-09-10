# Full PR impact

Use **Analyze entire PR** in a PR detail or a work item's linked PR. Collection is
on demand and independent of the displayed 30-file detail page. Refresh explicitly
after changes; results are snapshots, not a live subscription or persisted analysis history.

```sh
worklens pr-impact --repo /absolute/path/to/repository --params '{"number":12}'
worklens pr-impact --repo /absolute/path/to/repository --params '{"slug":"upstream/repo","number":12}'
```

MCP uses `worklens_query` with `operation:"pr_impact"`, the same repository and
params. It shares the desktop/CLI service operation. Use the CLI and service from
the same build; restart an already running older Worklens service after upgrading.

## Collection evidence

- Capture base repository, source repository (including forks), base SHA, head SHA
  and expected changed-file count before collection.
- Read file pages of 100, retaining status and both paths for renames. No patch
  bodies or CI logs are included in this response.
- Read PR metadata again. If either SHA, source or count changed, discard mixed
  files. If the final check is unavailable, mark the collection unverified and
  withhold impact. Before/after checks are observations, not a transactional API snapshot.
- Failures, invalid/duplicate pages, short listings and bounds remain explicit.
  Previous valid pages may yield a partial estimate, never a complete file collection.
- GitHub caps this endpoint at 3,000 files, with 100 per page. Larger PRs are
  explicitly partial. See the official [list PR files endpoint](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests-files).

Network file collection has a 60-second deadline, followed by a final metadata
check bounded to 10 seconds. The local graph has a 25-second budget. An oversized
serialized result (over 12 MB) fails explicitly rather than silently truncating.

## Impact semantics

Current and previous file paths match local component roots. Reverse project and
package dependency reachability identifies transitive dependants; task and
identity-containment edges are excluded. Each direct component retains matching
paths; each dependant retains the discovery edge with kind, evidence and origin.
Cycles terminate. Relations remain estimates, including declared or candidate edges.

Unmatched paths remain visible, including files from components absent in the
current checkout. Root manifests, lockfiles and `.github/` changes are flagged for
workspace-wide manual review; this heuristic is not exhaustive and does not invent
dependencies or prove validation coverage.

The graph comes from the selected **local worktree**, with its sampled HEAD and
connector provenance. It is not rebuilt in a temporary PR checkout. A different
SHA, dirty tree, missing source remote, or failed after-check makes the mismatch
explicit. Even matching clean samples do not guarantee immutable local config or
installed dependency state. Missing connectors do not prevent reading collected
files. Existing repository execution trust is honored; there is no automatic
installation, fetch, checkout, lockfile write or GitHub mutation.

`collection.provenance.status == "available"` describes file collection only.
It never means the dependency graph or validations are complete.

Expected validations, structured human-agent decisions and work-specific context
export remain separate functional increments.
