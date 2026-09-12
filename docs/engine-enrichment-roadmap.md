# Component intelligence — proposed next steps

The first technical-details collector is implemented in the component inspector and shared engine. Each next collector should expose its source, collection time, scope, missing-data reason, and cost. Passive metadata should remain available without repository execution trust.

| Priority | Enrichment | What it enables |
| --- | --- | --- |
| 1 | Version, license, package source, direct/transitive role | Explain what each dependency is and why it is present. |
| 1 | Ownership from CODEOWNERS, maintained paths, recent contributors | Find who should review a change or dependency update. |
| 1 | Dependency cycles, incoming/outgoing counts, affected consumers | Identify modules whose changes have the broadest impact. |
| 2 | Content fingerprints, per-file manifests and checksum verification | Detect vendor modifications and verify actual bytes against an expected source. |
| 2 | Size breakdown by code, tests, assets and build outputs | Explain growth without conflating repository size, installed size and bundle size. |
| 2 | Churn, last activity and rename-aware history | Spot frequently changing or apparently abandoned modules, with local-history limits explicit. |
| 3 | CI results and test coverage tied to an exact commit | Show validation evidence relevant to the version being inspected. |
| 3 | Opt-in vulnerability and license policy checks; SBOM export | Audit external components with versioned advisory data and explicit network access. |

Suggested next delivery: version/license/origin plus “why is this dependency here?”. It complements the new package/vendor distinction and makes the graph immediately more actionable.
