# Cleanup Report for bias-room-pipeline

**Audit Date:** May 23, 2026  
**Scope:** Complete codebase audit for unused, duplicate, and misplaced files  
**Status:** Conservative recommendations — only flagging items with clear evidence

---

## Summary Table

| Item | Location | Status | Recommendation |
|---|---|---|---|
| `src/components/manual-entry/` directory | `/src/components/manual-entry/` | 🗑️ Safe to delete | Delete entire directory (44 KB, unused) |
| `src/components/manual/` directory | `/src/components/manual/` | ✅ Fine as-is | Keep — actively imported and used |
| Unused asset files | `src/assets/{react.svg, vite.svg, hero.png}` | 🗑️ Safe to delete | Delete all 3 files (25 KB total) |
| `src/hooks/.gitkeep` | `/src/hooks/.gitkeep` | 🗑️ Safe to delete | Delete placeholder file (0 KB) |
| `supabase/.temp/` directory | `/supabase/.temp/` | 📌 Keep but fix | Add to `.gitignore` — currently exposed |
| `.gitignore` coverage | `/root/.gitignore` | 📌 Keep but fix | Add missing entries: `.env.local`, `supabase/.temp/` |
| `scripts/seed-run-log.mjs` | `/scripts/seed-run-log.mjs` | ✅ Fine as-is | Keep — documented utility, referenced in `package.json` |
| Database tables (`weekly_bias_reports`, `system_logs`) | Supabase schema | ✅ Fine as-is | Not referenced in React app; handle at DB level separately |

---

## Detailed Findings

### 1. Duplicate Component Directories: `manual/` vs `manual-entry/`

**What it is:**  
Two nearly identical directories containing the same components (CBToneTab, ConsensusTab, GeoRiskTab):
- `src/components/manual/` (3 files, 40 KB) — **LIVE**
- `src/components/manual-entry/` (4 files, 44 KB) — **DEAD**

**Evidence:**

1. **Live directory imports:**
   - `src/pages/ManualEntry.tsx` imports from `../components/manual/`:
     ```
     import { CBToneTab } from '../components/manual/CBToneTab'
     import { ConsensusTab } from '../components/manual/ConsensusTab'
     import { GeoRiskTab } from '../components/manual/GeoRiskTab'
     ```
   - Zero references to `manual-entry/` anywhere in the codebase.

2. **Code comparison:**
   - `manual/CBToneTab.tsx` (341 lines) — Active version with full logic for saving drafts and verified entries, complex form state management, slider styling, and recent entries table.
   - `manual-entry/CBToneTab.tsx` (311 lines) — Older variant with simpler styling, missing some UI refinements.
   - `manual/ConsensusTab.tsx` (317 lines) vs `manual-entry/ConsensusTab.tsx` (339 lines) — Manual-entry version includes extra operator notes state fields that are not in the live version.
   - `manual/GeoRiskTab.tsx` (442 lines) vs `manual-entry/GeoRiskTab.tsx` (380 lines) — Manual version is more complete.
   - Only `manual-entry/` has `CurrencyPills.tsx` (orphaned utility component, 15 lines) — not used anywhere.

3. **Conclusion:** `manual/` is the live, actively imported directory. `manual-entry/` is a dead duplicate from an earlier refactoring phase.

**Recommended action:**
```bash
rm -rf src/components/manual-entry
```
**Impact:** Deletes 44 KB of unused code and removes a confusing naming collision that could trip up future developers.

---

### 2. Unused Asset Files

**What it is:**  
Default Vite and React logo/hero files in `src/assets/`:
- `react.svg` (4.0 KB)
- `vite.svg` (8.5 KB)
- `hero.png` (13 KB)

**Evidence:**
- Full codebase grep for `.svg`, `.png`, and asset imports returns **zero matches** in `src/`.
- `src/App.tsx` has no `import` statements referencing these files.
- `src/index.css` contains only Tailwind directives — no asset references.
- These are standard Vite project scaffolding artifacts, never actually used.

**Recommended action:**
```bash
rm src/assets/react.svg src/assets/vite.svg src/assets/hero.png
```
**Impact:** Deletes 25 KB of unused static assets and keeps the assets directory clean and production-ready.

---

### 3. The `supabase/.temp/` Directory

**What it is:**  
Auto-generated Supabase CLI runtime files (9 files, 1.5 KB total):
```
supabase/.temp/
├── cli-latest
├── gotrue-version
├── linked-project.json
├── pooler-url
├── postgres-version
├── project-ref
├── rest-version
├── storage-migration
└── storage-version
```

**Evidence:**
- These are runtime metadata files created by the Supabase CLI during initialization and updates.
- **NOT currently in `.gitignore`** — this is a critical oversight.
- These files should never be committed to git; they are machine-local and can cause conflicts across team environments.

**Recommended action:**
```bash
# Add to .gitignore:
supabase/.temp/
```
**Impact:** Prevents accidental commits of environment-specific Supabase metadata. No files need to be deleted; just prevent future commits.

---

### 4. `.gitignore` Coverage Issues

**What it is:**  
Review of `/root/.gitignore` shows several critical gaps:

**Current state:**
```
node_modules          ✓ Covered
dist                  ✓ Covered
dist-ssr              ✓ Covered
*.local               ✓ Covered (.env.local is caught by *.local)
```

**Missing entries:**
- `supabase/.temp/` — **NOT covered** (should be explicit to prevent confusion)
- `.env.local` is only caught by the generic `*.local` rule — could be more explicit

**Recommended action:**
Add to `.gitignore`:
```
# Supabase CLI runtime files
supabase/.temp/
```

This is not critical (since `*.local` covers `.env`), but it's best practice to be explicit about what should never be committed.

---

### 5. The `src/hooks/.gitkeep` File

**What it is:**  
A placeholder file (0 bytes) used to ensure the `src/hooks/` directory is tracked by git before any hooks are added.

**Evidence:**
- The directory now contains 8 real hook files: `useCBTone.ts`, `useConsensusSurvey.ts`, `useDataExplorer.ts`, `useGeoRisk.ts`, `useRunLog.ts`, `useSnapshot.ts`, `useWorkflowRegistry.ts`, `useWorkflowStatus.ts`.
- `.gitkeep` is no longer needed.

**Recommended action:**
```bash
rm src/hooks/.gitkeep
```
**Impact:** Removes unnecessary placeholder (0 KB impact, minor cleanliness win).

---

### 6. The `scripts/seed-run-log.mjs` Script

**What it is:**  
A Node.js utility that seeds 15 sample `ops_ingestion_runs` rows into the database for testing the Run Log UI.

**Evidence:**
- **Referenced in `package.json`:**
  ```json
  "seed:runs": "node scripts/seed-run-log.mjs"
  ```
- Script includes comprehensive comments explaining its purpose and usage.
- Script validates that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `.env.local`.
- No import statements anywhere; it's a standalone CLI utility, not a library function.

**Status:** ✅ **Keep as-is**  
This is a legitimate development utility, not a leftover artifact. It should be documented in a development setup guide if one exists.

---

### 7. Database Tables Flagged for Removal

**What it is:**  
Two tables mentioned in the TBR Data Pipeline Guide (Section 18, Phase 7):
- `weekly_bias_reports` — marked for DROP ("out of scope")
- `system_logs` — marked for deprecation ("superseded by ops_ingestion_runs")

**Evidence:**
- Grep across entire `src/` directory returns **zero matches** for either table name.
- The React app makes no reference to these tables; they are purely backend schema concerns.
- If these tables exist in the Supabase database, they should be removed via migration, not via the React app.

**Status:** ✅ **Not an app-level concern**  
These tables are out of scope for this audit, which focuses on React source code. Handle table cleanup via Supabase migrations separately.

---

## Action Checklist

Use this checklist to apply the cleanup:

- [ ] Delete `src/components/manual-entry/` directory
- [ ] Delete `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png`
- [ ] Delete `src/hooks/.gitkeep`
- [ ] Add `supabase/.temp/` to `.gitignore`
- [ ] (Optional) Make `.env.local` explicit in `.gitignore` for clarity
- [ ] Verify build succeeds with `npm run build`
- [ ] Commit with message: "chore: remove duplicate components and unused assets"

---

## Impact Estimate

| Deletion | Size Saved | Benefit |
|---|---|---|
| `manual-entry/` directory | 44 KB | Eliminates component naming confusion, removes dead code |
| Three asset files | 25 KB | Cleaner asset directory, zero production impact |
| `.gitkeep` | 0 KB | Removes placeholder file (cleanliness) |
| **Total** | **~69 KB** | **Removes redundancy, reduces cognitive load** |

**Additional benefit:** Adding `supabase/.temp/` to `.gitignore` prevents accidental commits of environment-specific metadata files across the development team.

---

## Confidence Level

**High confidence (95%).** All recommendations are based on direct code inspection:
- Zero dangling imports or references verified via grep
- Clear evidence of which components are actively used
- Explicit .gitignore gaps identified
- No breaking changes expected from any deletion

**Low risk:** All flagged items are either unused code or configuration oversight — no business logic will be affected.
