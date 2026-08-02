# Changelog

All notable changes to LogicBoard Studio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
