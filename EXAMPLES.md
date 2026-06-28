# Examples — Framer to Elementor V4 Pipeline

Copy-paste commands for the 8 most common workflows.

---

## 1. Full pipeline: Framer URL → Elementor V4

```bash
# Basic: extracts, converts, pushes to WordPress
node wizard.js pipeline --url https://your-project.framer.app/

# With a specific post ID
node wizard.js pipeline --url https://your-project.framer.app/ --post-id 42

# Dry-run first (no MCP writes, generates plan only)
node wizard.js pipeline --url https://your-project.framer.app/ --dry-run
```

---

## 2. Resume after a failed run

```bash
# After a failure in phase 11 (convert-xml), resume from there:
node wizard.js pipeline --url https://your-project.framer.app/ --resume

# View what the last run completed before resuming:
cat .pipeline/state.json
```

---

## 3. Preflight — system check before building

```bash
# Full preflight: checks MCP, Elementor version, Framer connectivity
node wizard.js preflight

# Individual checks
npm run preflight:experiments   # Verify Elementor V4 experiments active
npm run preflight:unframer      # Check Unframer connectivity
npm run preflight:xml-match     # Verify XML matches current Framer project
```

---

## 4. Dry-run — generate build plan without writing

```bash
# Generate full plan (JSON + markdown) without any MCP calls
node wizard.js dry-run --url https://your-project.framer.app/

# From an already-exported directory (faster, skips Framer export step)
node wizard.js dry-run --export-dir exports/my-project/
```

---

## 5. From a local export directory (skip Framer export)

```bash
# If you already have a framer-export in exports/my-project/:
node wizard.js pipeline --export-dir exports/my-project/ --post-id 99

# Dry-run of the same:
node wizard.js pipeline --export-dir exports/my-project/ --dry-run
```

---

## 6. Visual QA — compare Framer vs WordPress rendering

```bash
# Section-level screenshot diff (configure URLs in .env first):
# FRAMER_PREVIEW_URL=https://your-project.framer.app/
# WP_PREVIEW_URL=http://solar.local/your-page/
npm run compare:hero

# Manual: compare any two URLs
node scripts/section-compare.js \
  --framer-url https://your-project.framer.app/ \
  --elementor-url http://solar.local/your-page/ \
  --section hero --above-fold

# Run full post-build QA suite
npm run post-build-qa
```

---

## 7. Token extraction and validation

```bash
# Extract design tokens from Framer CSS
npm run token-extract

# Validate the V4 tree against the schema
npm run schema-validate

# Cross-validate: check tokens made it into the built tree
node scripts/cross-validate-sources.js

# Check guard score before pushing (85% threshold)
npm run validate
```

---

## 8. Batch build — multiple pages in one run

```bash
# Batch build from a list of Framer pages
node wizard.js batch --config batch-config.json

# batch-config.json format:
# [
#   { "url": "https://ex.framer.app/", "postId": 10 },
#   { "url": "https://ex.framer.app/about", "postId": 11 }
# ]
```

---

## Common flags

| Flag | Description |
|---|---|
| `--url <url>` | Framer project URL |
| `--post-id <id>` | Target WordPress post ID |
| `--export-dir <dir>` | Use local framer-export directory |
| `--dry-run` | No writes, plan only |
| `--resume` | Resume from last checkpoint |
| `--skip-qa` | Skip visual QA gate |
| `--verbose` | Extended logging |
| `--target <name>` | WordPress target profile (default: env file) |

---

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for fixes to the 5 most common errors.
