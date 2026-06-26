# FAQ — Framer to Elementor V4 Pipeline

---

**Q1: What's the difference between Framer and Unframer?**

Framer is the design/hosting platform. Unframer is the MCP server that exposes your Framer project's XML via `getProjectXml` / `getNodeXml`. This pipeline uses both: Framer for the live CSS tokens (via browser crawl) and Unframer for the structural XML. You need an active Unframer connection (check with `npm run preflight:unframer`).

---

**Q2: When should I use V3 mode vs V4 mode?**

- **V4 (default):** Use when your WordPress has Elementor 3.19+ with Atomic Widgets experiment active. Required for modern flex-based layouts, global classes, and CSS logical properties.
- **V3:** Use for older WordPress installs or when the target runs Elementor without the Atomic Widgets experiment. Produces `elType: section/column/widget` trees.

Check your target Elementor version:
```bash
npm run check-v4
```

If Atomic Widgets is not active, the pipeline falls back to V3 automatically.

---

**Q3: What does the guard score mean and what should I do if it's below 85?**

Guards run 14 checks on the generated JSON tree before any push. Each failed critical check costs 20 points; each failed warning costs 5 points. Score ≥85 is required to proceed.

A score of 74 means one critical + one warning failure. Read the guard output, fix the specific issue (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#4-pipeline-exit-code-1--guard-score-below-85)), and re-run.

Do not lower the threshold in production — the guards prevent broken pages from being pushed to WordPress.

---

**Q4: How do I target a different WordPress install?**

Copy `.env.example` to `.env` and set:
```
WP_API_URL=https://your-wp-install.com/wp-json/mcp/novamira
WP_API_USERNAME=YourWpUser
WP_API_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
```

Multi-target support (e.g. `--target staging`) is on the roadmap (Sprint A2).

---

**Q5: The pipeline failed halfway through. Do I have to start over?**

No. Use `--resume`:
```bash
node wizard.js pipeline --url https://your-project.framer.app/ --resume
```

The pipeline saves its state to `.pipeline/state.json` after each successful phase. `--resume` reads that file and skips completed phases. To see the current state:
```bash
cat .pipeline/state.json
```

---

**Q6: How do I convert a Framer project that requires authentication (password-protected)?**

Use the `--export-dir` flag with a local framer-export you captured manually:
```bash
node wizard.js pipeline --export-dir exports/my-project/ --post-id 42
```

Alternatively, configure Framer Basic Auth via `FRAMER_BASIC_AUTH_TOKEN` in `.env` (see `.env.example`).

---

**Q7: What image formats are supported? What happens if Framer uses WebP?**

The pipeline uploads all images to WordPress media via `asset-to-wp-media.js`. WebP is supported. The resulting WP attachment IDs replace the original URLs in the Elementor tree. Images without WP IDs will render but won't benefit from srcset or lazy loading — the guard system flags these (G5 / CV3).

---

**Q8: Can I run the pipeline on a site I don't own (e.g. competitor research)?**

Only if you respect `robots.txt`. The pipeline checks `robots.txt` during preflight and aborts the browser crawl if the URL is disallowed. Never use this tool to scrape sites without permission.

---

**Q9: How do I add a new section type / component to the converter?**

1. Add the component pattern to `scripts/extract-framer-components.js`.
2. Add the widget mapping to `scripts/convert-xml-to-v4.js` (the `WIDGET_MAP` constant).
3. Add a guard variant if the component has required settings (in `scripts/framer-pre-build-validate.js`).
4. Add a fixture and test in `tests/fixtures/`.

See `CONVENTIONS.md` for naming rules and `PIPELINE.md` for the full step overview.

---

**Q10: The README says 434 tests. How do I run them all?**

```bash
# Full suite (pipeline + lib + sprint19 tests):
npm test

# Everything including e2e and integration:
npm run test:all

# Just the lib tests:
npm run test:lib

# Watch mode during development:
node --test --watch tests/pipeline.test.js
```

CI runs the full suite on Node 18, 20, and 22 on every push to main.
