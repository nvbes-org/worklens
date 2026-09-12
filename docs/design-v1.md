# Worklens V1 desktop design

The desktop uses the navigation and screen compositions from
[Worklens — V1 — Navigation](https://www.figma.com/design/Bkplw2WTl9xJB3rI6fR5Mm/Worklens-%E2%80%94-V1-%E2%80%94-Navigation).
The reference frames are Overview `2:4`, Architecture `23:234`, Git `26:345`, and Settings `26:1495`.
The local Figma Dev Mode server denied design-context access during implementation; the implementation
uses the previously reviewed screen layouts and measurements, rather than claiming a fresh automated export.

## Layout and motion

- A 224 px project sidebar, a fixed 52 px toolbar, and a 440 × 48 px floating navigation island.
- Overview, Architecture, and Git form the main navigation. The sidebar contains project switching and Settings.
- The icon-only sidebar control is its own component. The adjacent worktree select opens an existing worktree for inspection.
- Normal sidebar collapse slides it left and expands the main screen. Toolbar buttons and the bottom island stay fixed.
- Settings occupies an opaque `#f1f2f5` surface underneath the workspace. Opening it sends the sidebar left and the main screen right, with the toolbar and island exiting to the right.
- Transitions take 300 ms with a restrained ease-out curve. CSS honors system reduced motion and the local Reduce motion preference.
- The previous project page remains mounted during Settings. Escape and Back to project restore it and return keyboard focus to the Settings trigger.
- Inactive layers are inert and excluded from the accessibility tree. Settings content is hidden after closing so it cannot show through the translucent sidebar.

## Components and data

Existing shadcn-style Button, Input, Dialog, Tabs, and Badge primitives are reused. Dedicated SidebarToggle,
ProjectSwitcher, WorkspaceToolbar, ViewHeading, ComponentInspector, and GitDiff components provide the desktop structure.
No dependencies were added. Shared tokens use white, zinc neutrals, and Apple blue (`#007aff`).

- Overview shows real changes/conflicts, discovered components, dependency counts, and recent commits.
- Architecture retains ELK layout and React Flow interaction, search, type/external filters, list view, relation evidence, and trusted task-graph inspection. Its module inspector sits beside the graph.
- Git shows conflicts, unstaged and staged changes, unified diffs, history, branches, and worktrees. Remote references remain last known; Refresh does not fetch.
- Stage, commit, and sync are disabled because the engine exposes observation only. No write behavior is simulated.
- Settings exposes persistent start-page, sidebar, density and motion preferences, plus repository trust and tool diagnostics. It retains the application's English language. Editor selection and restore-project behavior from the mock are not presented as implemented preferences.

The pre-existing V1 simplification is preserved: deferred alpha pages and their tests live in
`apps/desktop/archive` and `tests/archive`. Those archives are not compiled or executed by the V1 application.

## Validation

The browser regression suite checks independent panel motion using animation-frame geometry, stationary
toolbar/navigation during collapse, focus restoration, retained Git selection, reduced motion, persisted
preferences, search, project-opening errors, trust settings, graph filtering/selection, and Git inspection.
Screenshots are generated at 1440 × 900 and the native minimum size of 1000 × 700.

The in-app Browser successfully exercised sidebar and Settings navigation without console errors but returned
blank screenshot output. Visual review therefore used the repository's Playwright fixture screenshots.
Fixture data is injected only in test mode; it is never substituted for real repository data in production.

The test server uses port 1421 by default (override with `WORKLENS_TEST_PORT`) so it does not interrupt
an active Tauri development server on port 1420. Native packaging, keychain flows, and real repository trust
are separate from the frontend validation performed for this design change.
