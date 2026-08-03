# Changelog

All notable changes to LogicBoard Studio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] - 2026-08-03

### Added

- Added a dedicated Credits activity containing Pablo Santana de Oliveira and `pablosdev.portfolio.app`.
- Added automated coverage for activity-bar selection, switching, and toggle-to-close behavior.
- Added a reusable React collapse control with explicit left, right, up, and down directions.

### Changed

- Changed the Explorer and Projects activity buttons to close the entire sidebar when selected again, matching the VS Code toggle behavior.
- Moved Credits out of application settings and into the activity bar.
- Changed board groups and individual devices to retain their intrinsic minimum size instead of stretching into available space.
- Changed the four HEX displays to fixed compact `62 × 72 px` cards.
- Changed the desktop window to start maximized.
- Changed timed samples to use one consistent millisecond display and removed the duplicate time from the bottom-panel header.
- Replaced text-character collapse affordances with consistent chevron icons throughout the workspace.
- Compacted the four seven-segment cards and placed their group beside the clock group on the board's first row.

### Fixed

- Removed the Windows verbatim `\\?\` prefix from project paths exposed to the interface while retaining canonical paths internally.

## [0.5.0] - 2026-08-03

### Added

- Added a labeled template section to New Project and exposed all starter templates permanently in the project switcher.
- Added a configurable default VHDL projects directory to application settings.
- Added a Credits settings tab for Pablo Santana de Oliveira and `pablosdev.portfolio.app`.

### Changed

- Kept New Project actions fixed below the scrollable form so Cancel and Create Project remain visible.
- Changed seven-segment displays to a compact four-column strip and made the remaining board groups use stable columns with no more than two rows.
- Improved interface and monospace font rendering and increased the legibility of compact labels and template descriptions.

### Fixed

- Fixed background project analysis to consume structured native diagnostics.
- Prevented the production Windows application from opening an accompanying console window.

## [0.4.1] - 2026-08-03

### Added

- Added a structured compilation report with the analysis engine and GHDL version, VHDL standard, project target, ordered sources and line counts, interface size, assigned pins, simulation model, duration, and compiler diagnostics.

### Changed

- Changed the browser compilation message into an explicit structural preflight report that distinguishes local preview checks from full desktop GHDL analysis.

## [0.4.0] - 2026-08-02

### Added

- Added confirmation before removing granular or vector board assignments.
- Added an untimed interactive state for combinational projects without mapped clocks.
- Added a VS Code-style activity bar, project hub, and first-launch project welcome screen.
- Added template shortcuts to project actions and to the recent-project selector when no recent projects exist.
- Added automated coverage for vector-bit removal, logical-level counts, initial workspace selection, and viewport-aware bottom-panel limits.

### Changed

- Changed waveform status from an ambiguous value legend to actual counts of signals at logical levels 0 and 1.
- Changed the bottom panel to open at its minimum height and preserve a usable upper workspace while resizing.
- Changed the board to prioritize a two-column group layout and a minimum useful panel width.
- Moved board mapping guidance below the functional schematic heading and removed the redundant interactive-board title.
- Changed Explorer so its file tree scrolls independently while the configured top entity remains visible.
- Changed first launch without legacy data to show project choices instead of opening an implicit starter project.

### Removed

- Removed the redundant target-device badge from the toolbar.
- Removed controls for hiding individual signals from the current-sample panel.
- Removed time and speed indicators from combinational projects where elapsed simulation time has no useful meaning.

### Fixed

- Fixed assignment deletion for bits expanded from a vector mapping while preserving the remaining mapped bits.
- Fixed oversized bottom panels extending the document below the application viewport.
- Fixed board groups wrapping to a new row even when a two-column arrangement fits.

## [0.3.0] - 2026-08-02

### Added

- Added the locally bundled Monaco editor with VHDL syntax highlighting, native line numbers, per-file models, preserved view state, and read-only generated constraints.
- Added closeable VS Code-style editor tabs that retain project sources and reopen from Explorer.
- Added a native default `Documents/LogicBoard Projects` directory, remembered project location, and an eight-entry recent project switcher.
- Added a New Project destination field, folder browser, child-path preview, and clear explanation of the folder that will be created.
- Added automated coverage for tooltip placement, VHDL highlighting rules, editor tab transitions, recent projects, starter drafts, and top-entity reconciliation.

### Changed

- Separated the recent-project selector from the New/Open/Save As/Settings actions menu.
- Changed untouched starter projects to be safely replaceable while continuing to protect edited and legacy-recovered drafts.
- Changed the configured top entity automatically when exactly one valid entity remains after editing.
- Moved the interactive-board title and mapping guidance inside the board's scrollable canvas.
- Kept validation errors that can be fixed in the editor inside Problems while reserving native dialogs for blocking filesystem failures.

### Fixed

- Prevented board tooltips from leaving the viewport by measuring, flipping, and clamping their rendered position.
- Fixed editor tabs so only the active tab has a cyan top border and inactive separators remain subtle.
- Fixed New Project so unsaved work is resolved before template and destination selection rather than after it.
- Removed the redundant Open Existing button from the New Project dialog.

## [0.2.0] - 2026-08-02

### Added

- Added an implementation roadmap covering viewport-safe tooltips, native project folders, multi-file editing, project templates, hardening, acceptance criteria, and granular Conventional Commit boundaries.
- Added this changelog to track user-visible code and documentation changes.
- Added the versioned `logicboard.project.json` format for ordered VHDL sources, target board and top entity settings, and board assignments.
- Added restricted Tauri commands to list templates and create, open, save, and save projects as real local folders.
- Added native folder selection through the official Tauri dialog plugin and blocking error dialogs for operations that cannot continue.
- Added the narrowly scoped Tauri window permission required to destroy the window after a confirmed Save or Discard close decision.
- Added active-project state with saved baselines, source-level dirty markers, multiple editor tabs, a generated constraints tab, and top-entity discovery across files.
- Added Project menu actions, Project Settings, a New Project template chooser, toolbar Save, `Ctrl+S`, and Save/Discard/Cancel protection for project replacement and application close.
- Added one-time recovery of legacy source and assignment data as an unsaved `Recovered board-demo` project; migrated keys are removed only after a successful save.
- Added immutable blank, LED/switch mirror, button/seven-segment, and four-digit timer starter projects with manifests, mappings, commented VHDL, and READMEs.
- Added frontend and Rust coverage for dirty state, legacy recovery, ordered source payloads, native API failures, validation, traversal and symlink rejection, transactional rollback, persistence, and template independence.
- Added global application settings with a persistent Portuguese/English language selector.
- Added Brazilian Portuguese translations for the simulator, project workflows, editor, board, inspector, mapper, waveform, compilation messages, tooltips, and native project errors.
- Added localization tests for the default language, saved English preference, and translated value interpolation.

### Changed

- Changed VHDL analysis and simulation to stage every source using its validated relative path and manifest order.
- Changed the editor Explorer and tab strip to render all project sources followed by read-only generated `constraints.qsf`.
- Changed board and top-entity settings, assignments, diagnostics, inputs, and waveform state to follow the active project lifecycle.
- Changed the default interface language to Brazilian Portuguese while retaining English as an option.

### Security

- Restricted project sources to UTF-8 `.vhd` and `.vhdl` files below `src/`, with size limits and rejection of absolute paths, traversal, duplicates, escaping symlinks, unknown boards, malformed assignments, and missing top entities.
- Made project saves transactional by staging all writes, retaining backups during replacement, replacing the manifest last, and restoring replaced files on failure.
- Required in-place saves to target a previously valid LogicBoard project root.

### Fixed

- Kept editor line numbers vertically aligned with editable VHDL and generated constraints while scrolling or switching files.
- Preserved legacy recovery data when the user discards the draft or opens another project instead of saving the recovered project.
- Made desktop-runtime detection safe in tests and browser development previews.
