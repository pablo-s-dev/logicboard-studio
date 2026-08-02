# LogicBoard Studio Roadmap

This roadmap tracks the next implementation work for the editor, desktop project workflow, and bundled examples. A checked item is implemented and verified; unchecked items remain planned.

## Editor reliability

- [x] Keep editor line numbers synchronized with vertical source scrolling.
- [x] Preserve gutter alignment when source text changes or the active file changes.
- [x] Keep horizontal source scrolling independent from the line-number gutter.
- [ ] Add focused component coverage for editor scrolling when a DOM test environment is introduced.

Acceptance criteria:

- The gutter and source remain aligned at the first, middle, and final lines of a long file.
- Wheel and scrollbar scrolling produce the same alignment.
- Editable VHDL and generated constraints behave consistently.

Planned commits:

- `fix(editor): synchronize line numbers with vertical scrolling`

## Viewport-safe board tooltips

- [ ] Extract tooltip placement into a reusable, independently testable helper.
- [ ] Measure the rendered tooltip instead of assuming a fixed size.
- [ ] Prefer placement below and to the right of the pointer with a 12 px gap.
- [ ] Flip left or above the pointer when the preferred side would overflow.
- [ ] Clamp the final position to an 8 px margin on every viewport edge.
- [ ] Recalculate placement on pointer movement, scrolling, and window resizing.
- [ ] Limit tooltip width to the available viewport and wrap long text.
- [ ] Cover corners, narrow windows, long text, scrolling, and resizing in tests.

Acceptance criteria:

- No portion of a tooltip leaves the visible application viewport.
- The tooltip never blocks pointer interaction and does not flicker while changing sides.
- Placement remains correct at all four corners and at the current minimum window size.

Planned commits:

- `fix(board): keep tooltips inside the viewport`
- `test(board): cover viewport-aware tooltip positioning`

## Native project format

- [ ] Define a versioned `logicboard.project.json` manifest.
- [ ] Store `schemaVersion`, project name, target board ID, top entity, ordered VHDL source paths, and pin assignments.
- [ ] Keep editable VHDL files under `src/` and treat `constraints.qsf` as generated output.
- [ ] Reject absolute source paths, traversal outside the project root, unsupported extensions, duplicate paths, missing files, unsupported schema versions, unknown boards, and invalid assignments.
- [ ] Add clear validation errors that identify the manifest field or source involved.

The initial manifest contract will be:

```json
{
  "schemaVersion": 1,
  "name": "board-demo",
  "boardId": "cyclone-ii-ep2c20f484c7",
  "topEntity": "board_demo",
  "sources": ["src/board_demo.vhd"],
  "assignments": []
}
```

The existing `Assignment` representation remains the wire format for manifest assignments. Project paths are relative to the manifest directory and use forward slashes in the manifest.

Planned commit:

- `feat(projects): define and validate the local project format`

## Tauri persistence and project lifecycle

- [ ] Add Tauri commands for create, open, save, and save-as operations.
- [ ] Canonicalize the selected root and enforce that every read or write stays inside it.
- [ ] Write saves through temporary files followed by replacement so a failed save does not truncate project data.
- [ ] Pass all ordered project sources to the existing `analyze_project` and simulation commands.
- [ ] Replace the global source and assignment storage with active-project state.
- [ ] Support multiple editable source tabs plus the generated constraints tab.
- [ ] Track dirty state per source and for manifest-backed settings.
- [ ] Enable the Save toolbar action and `Ctrl+S`.
- [ ] Confirm before closing, switching, or replacing a project with unsaved changes.
- [ ] Report filesystem and manifest failures in the existing Problems or Compilation panels.
- [ ] Remove project dependence on browser `localStorage`; pane layout preferences may remain global.

Acceptance criteria:

- A project can be created, saved, closed, reopened, compiled, and simulated without losing sources or mappings.
- Save failures leave the previous on-disk project intact and keep the UI dirty.
- Multi-file analysis and simulation use manifest order and the selected top entity.
- The project feature is supported only by the Tauri desktop application; no browser project adapter is required.

Planned commits:

- `feat(projects): add native project filesystem persistence`
- `feat(editor): support multi-file project sources`
- `feat(projects): add create open and save workflows`

## Template projects

- [ ] Bundle immutable templates and copy the selected template into a user-chosen empty destination.
- [ ] Add an LED and switch mirror demonstrating introductory combinational logic.
- [ ] Add a pushbutton and seven-segment example demonstrating mappings and active-low signals.
- [ ] Add a four-digit timer based on `src/fixtures/timer_top.vhd` demonstrating clocks, sequential logic, and simulation pacing.
- [ ] Include a valid manifest, ready-to-run mappings, commented VHDL sources, and a short README in every template.
- [ ] Add a New Project dialog with blank-project and template choices.
- [ ] Ensure editing or deleting a created project never changes the bundled template.

Acceptance criteria:

- Every template opens without validation errors, compiles with GHDL, and has enough default mappings for immediate interaction.
- Creating the same template twice produces independent project folders.
- Template descriptions identify the concepts demonstrated and the expected board controls.

Planned commits:

- `feat(templates): bundle starter project examples`
- `feat(templates): add the new-project template chooser`

## Project hardening

- [ ] Test malformed manifests, traversal attempts, missing sources, duplicate sources, unknown boards, and invalid mappings.
- [ ] Test interrupted or denied saves and verify recovery behavior.
- [ ] Test unsaved-change prompts for project switching and application close.
- [ ] Test multi-file compilation order and top-entity selection.
- [ ] Test template copying, independence, compilation, and reopening saved projects.
- [ ] Run the full frontend suite and Rust tests in CI.

Planned commit:

- `test(projects): cover persistence and template workflows`

## Documentation maintenance

- [x] Add this implementation roadmap.
- [x] Add `changelog.md` with an Unreleased section.
- [ ] Update the changelog with every user-visible code or documentation change.
- [ ] Move Unreleased entries into a dated version section when preparing a release.

Planned commits:

- `docs: add implementation roadmap`
- `docs: add project changelog`

## Current validation baseline

- `npm test`: 20 tests passing in one test file after this delivery.
- `npm run build`: TypeScript and Vite production build passing after this delivery.
