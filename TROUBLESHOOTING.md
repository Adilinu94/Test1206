# Troubleshooting — Framer to Elementor V4 Pipeline

---

## 1. MCP 401 Unauthorized

**Symptom:**
```
[mcp-client] MCP call failed: 401 Unauthorized
[mcp-client] POST https://solar.local/wp-json/mcp/novamira → 401
```

**Cause:** Wrong or missing WordPress Application Password in `.env`.

**Fix:**
1. In WordPress admin → Users → Your profile → Application Passwords → generate a new one.
2. Copy the generated password (spaces included) into `.env`:
   ```
   WP_API_USERNAME=YourUsername
   WP_API_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
   ```
3. Run `node wizard.js preflight` to verify the connection.

---

## 2. Missing Elementor V4 experiments

**Symptom:**
```
[preflight] elementor-experiments: FAIL — atomic-widgets not enabled
Guard G-EXP failed: experimentNotActive
```

**Cause:** Elementor's "Atomic Widgets" experiment is not active on the target WordPress.

**Fix:**
```bash
# Auto-enable the required experiments via MCP:
npm run preflight:experiments

# Verify after:
npm run preflight:experiments-dry
```

Or manually in WP admin → Elementor → Settings → Experiments → enable "Atomic Widgets" and "Container".

---

## 3. GV-ID drift (Global Variable IDs not found in tree)

**Symptom:**
```
[cross-validate] CV5:gv-id-drift FAIL — 3 global-variable reference(s) with empty ID
[validate] Guard G8 failed: gvIdEmpty on element e1
```

**Cause:** The design-system-builder ran before the Global Variables were created in WordPress, so the GV IDs (e-gv-xxxxxxx) were not yet known.

**Fix:**
1. Run `adrians-setup-v4-foundation` first to create GV IDs.
2. Then re-run from the design-system step:
   ```bash
   node wizard.js pipeline --url ... --resume
   # Or force-restart from step 9:
   node scripts/design-system-builder.js --apply
   node scripts/convert-xml-to-v4.js
   ```
3. Check actual IDs in the kit:
   ```bash
   npm run check-v4
   ```

---

## 4. Pipeline exit code 1 — Guard score below 85

**Symptom:**
```
[pipeline] PRE-BUILD VALIDATION FAILED — score 74/100 (min 85)
  ✗ [G1:unique-ids] 2 duplicate element IDs
  ⚠ [G4:breakpoint-coverage] 3 sections tablet-only
```

**Cause:** The generated V4 tree has structural issues the guard system caught before the push.

**Fix by guard:**

| Guard | Typical fix |
|---|---|
| G1 unique-ids | IDs are auto-generated; re-run `convert-xml-to-v4.js` with `--force-regen-ids` |
| G2 orphan-columns | Check `extract-framer-css-tokens.js` output for malformed columns |
| G4 breakpoint-coverage | Add `--responsive` flag to `convert-xml-to-v4.js` |
| G7 hyphen-in-class | Class names must be camelCase: `heroTitle` not `hero-title` |
| G8 dom-depth | Flatten nested containers in the Framer source, then re-export |

Lower threshold temporarily for debugging (not for production):
```bash
PIPELINE_MIN_VALIDATION_SCORE=70 node wizard.js pipeline ...
```

---

## 5. Visual QA diff score too low (SSIM / pixelmatch)

**Symptom:**
```
[visual-qa] Section 'hero' FAIL — similarity 67% (min 85% for 'balanced' profile)
[visual-qa] Diff saved: reports/visual-diff-report.html
```

**Cause:** The rendered WordPress page looks visually different from the Framer source.

**Fix:**
1. Open `reports/visual-diff-report.html` to see the side-by-side diff.
2. Common causes:
   - **Fonts not loaded:** Run `npm run resolve-fonts` and re-push.
   - **Images without WP media IDs:** Run `npm run patch-media` to upload and replace URLs.
   - **Wrong spacing/padding:** Check guard G4 breakpoint coverage and compare desktop settings.
3. Auto-fix loop (up to 3 rounds):
   ```bash
   npm run auto-fix
   ```
4. Lower the QA profile temporarily to `draft` (70%):
   ```bash
   node scripts/run-post-build-qa.js --profile draft
   ```

---

## Getting more information

```bash
# Full verbose pipeline run
node wizard.js pipeline --url ... --verbose

# Check what the last pipeline state was
cat .pipeline/state.json

# Run doctor to diagnose the environment
node wizard.js doctor

# Profile the pipeline to find slow steps
npm run profile-pipeline
```
