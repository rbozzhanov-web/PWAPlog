# Browser Logbook PDF Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import reviewed Air Astana PDF logbook entries in the browser without changing core parsing behavior.

**Architecture:** A browser PDF.js adapter produces core `ExtractedPage[]`; core parser rules create candidates; feature routes present and persist only explicitly approved candidates through repositories.

**Tech Stack:** React, TypeScript, pdfjs-dist, Dexie, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-11-logbook-pdf-import-design.md`

## Global Constraints

- Keep PDF.js, `File`, workers, and DOM APIs out of `packages/core`.
- Preserve top-origin positioned-text output and existing core parser behavior.
- Do not persist candidates before explicit confirmation.
- Imported entries must use `source: 'pdf_import'`, one generated `importBatchId`, UUIDs, and audit timestamps.
- Use typed repositories only and the approved visual system.

---

### Task 1: Browser PDF.js extraction adapter

**Files:**
- Create: `apps/web/src/platform/pdf/extractText.ts`, `apps/web/src/platform/pdf/__tests__/extractText.test.ts`
- Modify: `apps/web/package.json`, `package-lock.json`

- [ ] Write failing tests for PDF.js text item normalization into `{ items, width, height }` with top-origin y.
- [ ] Run `npm run test:web -- apps/web/src/platform/pdf/__tests__/extractText.test.ts` and confirm RED.
- [ ] Add `pdfjs-dist`; implement `extractPdfText(file: File): Promise<ExtractedPage[]>` with a browser worker and normalized coordinates.
- [ ] Run focused test and `npm run build`; confirm GREEN.
- [ ] Commit: `feat: add browser PDF text extraction`.

### Task 2: Candidate draft repository and import transaction

**Files:**
- Create: `apps/web/src/db/repositories/pdfImport.ts`, `apps/web/src/db/repositories/__tests__/pdfImport.test.ts`

- [ ] Write failing tests proving candidate preparation dedupes through core logic and confirmation writes only approved entries with shared batch ID/provenance.
- [ ] Run focused test and confirm RED.
- [ ] Implement typed preparation/import functions using one transaction and no UI table access.
- [ ] Run focused test, full suite, and build; confirm GREEN.
- [ ] Commit: `feat: add reviewed PDF import transaction`.

### Task 3: File selection and review routes

**Files:**
- Create: `apps/web/src/features/import/ImportLogbookPage.tsx`, `ReviewImportPage.tsx`, `importDraft.ts`, tests
- Modify: `apps/web/src/app/routes.tsx`, `apps/web/src/styles/global.css`

- [ ] Write failing UI tests for drag/file selection, extraction failure, parsed warnings, editable candidates, and no writes before confirmation.
- [ ] Run focused tests and confirm RED.
- [ ] Implement `/import/logbook` and `/import/review`, carrying a transient draft, explicit import confirmation, and return to `/logbook`.
- [ ] Run focused tests, `npm run test`, and `npm run build`; confirm GREEN.
- [ ] Commit: `feat: add reviewed logbook PDF import`.
