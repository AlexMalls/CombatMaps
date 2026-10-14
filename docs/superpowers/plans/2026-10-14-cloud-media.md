# Cloud Media Implementation Plan

> Execute inline with superpowers:executing-plans. User approved scope and requested no further confirmations.

**Goal:** Git media picker with Firestore project persistence.
**Architecture:** Common media picker, versioned project codec, transactional chunked Firestore store and app snapshot bridge.
**Tech Stack:** Semantic HTML, browser JS, Firebase Web SDK, node:test.
**Spec:** ../specs/2026-10-14-cloud-media-firestore-design.md

## Global Constraints
- Local disabled, original file handlers retained. No Firebase Storage or Blaze.
- HUD excluded; only Storage image paths selectable.
- Changed state only every 10 seconds; independent local recovery; forced import sync.
- Per-account isolation and no silent conflict overwrite. Preserve concurrent Git uploads.

## Review Focus
- Empty remote project must stay empty.
- Malicious imports cannot supply arbitrary media URLs or invalid token references.
- Changes during a save must remain pending.
- API failures must show retry, without modifying drafts.
- Reload must preserve token identities, health and active scene.

## Tasks
- [x] Write failing node tests for media filtering, project validation, partition roundtrip, dirty sync and conflict behavior.
- [x] Implement media-library.js (filter, load, accessible dialog); organize HUD and Storage and integrate all image buttons.
- [x] Implement project-store.js (validateProject, partitionProject, createSync) and firebase-project.js (Google auth, atomic chunk reads/writes with revision).
- [x] Implement app snapshot/restore bridge, local recovery and settings import/export/sync. Remove production examples while preserving fixtures in existing unit tests.
- [x] Run node --test tests/*.test.cjs and browser visual checks. Review diff and verify no temporary image URLs are saved.
- [x] Commit and publish only changed files using expected branch SHA, preserving all user uploads. Report actual Firebase verification limits and rules setup if needed.

## Verification result
197 node tests passing (10 new, 1 updated). Real browser captures checked; browser integration exercises forced import, health/status export, dirty-state cache, checkbox recovery and token IDs. Live deployed Git media listing and Local disabled verified. Real Firestore writes await owner login and rule publication; no Storage configured.
