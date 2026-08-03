# LogicBoard Studio Roadmap

This roadmap tracks the next implementation work for the editor, desktop project workflow, and bundled examples. A checked item is implemented and verified; unchecked items remain planned.

## Editor reliability

- [x] Keep editor line numbers synchronized with vertical source scrolling.
- [x] Preserve gutter alignment when source text changes or the active file changes.
- [x] Keep horizontal source scrolling independent from the line-number gutter.
- [ ] Add focused component coverage for editor scrolling when a DOM test environment is introduced.
- [x] Replace the textarea and manual gutter with the bundled Monaco editor.
- [x] Add VHDL syntax highlighting and project-scoped editor models.
- [x] Add closeable tabs that preserve project sources and reopen from Explorer.
- [x] Distinguish active and inactive tabs without the previous repeated cyan borders.

Acceptance criteria:

- The gutter and source remain aligned at the first, middle, and final lines of a long file.
- Wheel and scrollbar scrolling produce the same alignment.
- Editable VHDL and generated constraints behave consistently.

Planned commits:

- `fix(editor): synchronize line numbers with vertical scrolling`

## Viewport-safe board tooltips

- [x] Extract tooltip placement into a reusable, independently testable helper.
- [x] Measure the rendered tooltip instead of assuming a fixed size.
- [x] Prefer placement below and to the right of the pointer with a 12 px gap.
- [x] Flip left or above the pointer when the preferred side would overflow.
- [x] Clamp the final position to an 8 px margin on every viewport edge.
- [x] Recalculate placement on pointer movement, scrolling, and window resizing.
- [x] Limit tooltip width to the available viewport and wrap long text.
- [x] Cover corners and narrow viewports in automated placement tests.

Acceptance criteria:

- No portion of a tooltip leaves the visible application viewport.
- The tooltip never blocks pointer interaction and does not flicker while changing sides.
- Placement remains correct at all four corners and at the current minimum window size.

Planned commits:

- `fix(board): keep tooltips inside the viewport`
- `test(board): cover viewport-aware tooltip positioning`

## Native project format

- [x] Define a versioned `logicboard.project.json` manifest.
- [x] Store `schemaVersion`, project name, target board ID, top entity, ordered VHDL source paths, and pin assignments.
- [x] Keep editable VHDL files under `src/` and treat `constraints.qsf` as generated output.
- [x] Reject absolute source paths, traversal outside the project root, unsupported extensions, duplicate paths, missing files, unsupported schema versions, unknown boards, invalid top entities, and malformed assignments.
- [x] Add clear validation errors that identify the manifest field or source involved.

The initial manifest contract will be:

```json
{
  "schemaVersion": 1,
  "name": "board-demo",
  "boardId": "ep2c20f484c7",
  "topEntity": "board_demo",
  "sources": ["src/board_demo.vhd"],
  "assignments": []
}
```

The existing `Assignment` representation remains the wire format for manifest assignments. Project paths are relative to the manifest directory and use forward slashes in the manifest.

Planned commit:

- `feat(projects): define and validate the local project format`

## Tauri persistence and project lifecycle

- [x] Add Tauri commands for listing templates and creating, opening, saving, and saving-as projects.
- [x] Canonicalize the selected root and enforce that every read or write stays inside it.
- [x] Stage every file, retain backups during replacement, replace the manifest last, and roll back a failed save.
- [x] Pass all ordered project sources to the existing `analyze_project` and simulation commands.
- [x] Replace the global source and assignment storage with active-project state.
- [x] Support multiple editable source tabs plus the generated constraints tab.
- [x] Track dirty state per source and for manifest-backed settings.
- [x] Enable the Save toolbar action and `Ctrl+S`.
- [x] Confirm before closing, switching, or replacing a project with unsaved changes.
- [x] Report filesystem and manifest failures in Problems and show a blocking native error dialog when an operation cannot continue.
- [x] Limit project persistence to native commands; only pane preferences and one-time legacy recovery use browser `localStorage`.

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

- [x] Bundle immutable templates and copy the selected template into a new child folder at a user-chosen location.
- [x] Add an LED and switch mirror demonstrating introductory combinational logic.
- [x] Add a pushbutton and seven-segment example demonstrating mappings and active-low signals.
- [x] Add a four-digit timer adapted for the 1 kHz interactive clock, with 50 MHz hardware guidance.
- [x] Include a valid manifest, ready-to-run mappings, commented VHDL sources, and a short README in every template.
- [x] Add a New Project dialog with blank-project and template choices.
- [x] Ensure created projects are independent copies of the bundled templates.

Acceptance criteria:

- Every template opens without validation errors, compiles with GHDL, and has enough default mappings for immediate interaction.
- Creating the same template twice produces independent project folders.
- Template descriptions identify the concepts demonstrated and the expected board controls.

Planned commits:

- `feat(templates): bundle starter project examples`
- `feat(templates): add the new-project template chooser`

## Project hardening

- [x] Test malformed manifests, traversal and symlink attempts, missing or oversized sources, duplicate sources, unknown boards, and malformed assignments.
- [x] Inject an interrupted transactional save and verify that replaced files are restored.
- [x] Test Save/Discard/Cancel transition decisions and manually verify the unsaved-change prompt.
- [x] Test ordered multi-file payloads and top-entity selection across sources.
- [x] Test template loading, independent copies, reopening saved projects, and analyze every bundled VHDL source with GHDL.
- [ ] Run the full frontend suite and Rust tests in CI.

## Desktop project experience

- [x] Use `Documents/LogicBoard Projects` as the native default parent directory.
- [x] Remember the last chosen parent directory and up to eight recent projects.
- [x] Split quick project switching from the project actions menu.
- [x] Explain and preview the child folder created by the New Project dialog.
- [x] Remove the redundant Open Existing action from template creation.
- [x] Treat an untouched starter as replaceable while protecting edited and recovered drafts.
- [x] Automatically select the only remaining VHDL entity when the configured top disappears.
- [x] Keep editable validation failures in Problems instead of showing a native blocking dialog.

Planned commit:

- `test(projects): cover persistence and template workflows`

## Documentation maintenance

- [x] Add this implementation roadmap.
- [x] Add `changelog.md` with an Unreleased section.
- [x] Update the changelog with every user-visible code or documentation change in this delivery.
- [ ] Move Unreleased entries into a dated version section when preparing a release.

Planned commits:

- `docs: add implementation roadmap`
- `docs: add project changelog`

## Current validation baseline

- `npm test`: 40 tests passing across seven test files.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: 17 tests passing.
- Bundled template validation: four VHDL sources accepted by the bundled GHDL runtime.
- `npm run build`: TypeScript and Vite production build passing.
