# Novamira Improvement Research — Consolidated Report

**Projekt:** `framer-v4-pipeline-v2` (Node.js CLI) + `Novamira AdrianV2` (WordPress-Plugin, 57 Abilities)  
**Generated:** 2026-06-10  
**Research Project:** `novamira-improvement-2026-06`  
**Output-Verzeichnis:** `novamira-improvement-2026-06/results/`  

---

## 1. Executive Summary

| Metrik | Wert |
|--------|------|
| Total Items auditiert | **46** / 46 (100%) |
| Total Findings | **47** |
| High Severity | **13** |
| Medium Severity | **22** |
| Low Severity | **12** |
| PROPOSED (no code yet) | **8** |
| Agents ausgeführt | **8** (agent_1 bis agent_8) |
| Coverage | **100%** aller 46 Research-Items |

**Severity-Skala:** HIGH = sofort adressieren (Sicherheit, Datenverlust, Build-Blocker) · MEDIUM = nächste Iteration · LOW = Backlog / Nice-to-have · PROPOSED = Architektur-Themen ohne bestehenden Code

## 2. Top-10 Action Items (nach Severity)

Die wichtigsten 10 Findings, sortiert nach Severity, mit klarem Handlungsauftrag:

### #1. A2 — Validation Threshold [HIGH]

**Block:** A-Pipeline  
**Observation:** Hard-coded exit criteria for score >= 85% is defined in comments but logic needs confirmation of strict enforcement.  
**Evidence:** `framer-pre-build-validate.js:15`  
**Recommendation:** Parameterize the 85% threshold to allow environment-specific CI tuning.  

### #2. A6 — Report Structure [HIGH]

**Block:** A-Pipeline  
**Observation:** QA report identifies 11 layout issues including deep nesting that must be addressed before build.  
**Evidence:** `qa-report.json:7,14`  
**Recommendation:** Integrate 'novamira/adrians-patch-element-styles' automatically if auto-fixable.  

### #3. B1 — Permission Callback [HIGH]

**Block:** B-V2-Plugin (Main Bootstrap)  
**Observation:** The `novamira_permission_callback` was not found in the initial file header/bootstrap; it appears the system uses standard WP capability checks.  
**Evidence:** `novamira-adrianv2.php scanning (header level)`  
**Recommendation:** Verify where the requested `novamira_permission_callback` is defined if it is intended to be a global middleware. (Known: 67 references in ability classes, defined in Novamira 1.6.0 plugin)  

### #4. B5 — Input Validation [HIGH]

**Block:** B-V2-Plugin (Elementor Page/Element Manipulation)  
**Observation:** The page_js input accepts raw strings to be appended as HTML widgets with <script> tags, creating a direct XSS risk if input is not sanitized or restricted.  
**Evidence:** `includes/abilities/elementor/class-batch-build-page.php:36`  
**Recommendation:** Implement strict output encoding or disallow <script> tags for page_js injection.  

### #5. B7 — File-type validation [HIGH]

**Block:** B-V2-Plugin (Media Management)  
**Observation:** The tool accepts base64 content and a filename from input, but lacks explicit server-side validation of the base64 content against the claimed file extension to prevent MIME-type spoofing.  
**Evidence:** `includes/abilities/media/class-media-upload.php:48`  
**Recommendation:** Validate file content against its extension using finfo_buffer or similar to ensure the file type matches the requested extension.  

### #6. B8 — Security Model [HIGH]

**Block:** B-V2-Plugin (PHP Sandbox)  
**Observation:** The system relies on external 'PHP_Sandbox_Validator' and 'PHP_Sandbox_Store' classes. It does not contain its own execution isolation logic, instead delegating code execution to unknown underlying implementation.  
**Evidence:** `includes/abilities/php-sandbox/class-php-snippets.php:57`  
**Recommendation:** Audit external dependency NickWebdesign\Adrians\PHP_Sandbox_Validator for usage of dangerous functions (e.g., eval, system) and ensure it enforces restricted namespace isolation.  

### #7. B9 — XSS-risk [HIGH]

**Block:** B-V2-Plugin (Custom Code Injection)  
**Observation:** CSS sanitization logic exists, but 'add-custom-js' directly registers an HTML widget capable of raw JS injection without further review.  
**Evidence:** `includes/abilities/custom-code/class-custom-code.php:56`  
**Recommendation:** Implement capability-based restrictions (e.g., `unfiltered_html`) strictly for all JS-related abilities.  

### #8. D1 — Config Presence [HIGH]

**Block:** D-Security (Static Analysis Integration)  
**Observation:** No SAST configuration files (phpstan.neon, psalm.xml, .semgrep.yml) found in the project root.  
**Evidence:** `SAST config check results — none found`  
**Recommendation:** Integrate a standardized static analysis tool with appropriate configuration files to ensure code quality. Recommended: Psalm with --taint-analysis for XSS/SQLi detection.  

### #9. D6 — filename sanitization [HIGH]

**Block:** D-Security (Media Upload Abilities)  
**Observation:** Input schema accepts 'filename' string directly without evidence of sanitization or extension validation prior to processing.  
**Evidence:** `includes/abilities/media/class-media-upload.php:25`  
**Recommendation:** Implement strict whitelist of allowed file extensions and sanitize 'filename' input using sanitize_file_name().  

### #10. E5 — N+1 problem [HIGH]

**Block:** E-Performance  
**Observation:** Visual QA script iterates through breakpoints but lacks explicit meta-query batching for post-data retrieval.  
**Evidence:** `scripts/visual-qa.js`  
**Recommendation:** Implement batch metadata fetching if retrieving data for multiple post_ids concurrently. Use get_post_meta with object caching.  

---

## 3. Findings by Block (gruppiert)

### A-Pipeline — 8 Finding(s)

- **[HIGH] A2** Validation Threshold
  - Hard-coded exit criteria for score >= 85% is defined in comments but logic needs confirmation of strict enforcement.
  - Evidence: `framer-pre-build-validate.js:15`
  - Fix: Parameterize the 85% threshold to allow environment-specific CI tuning.
- **[HIGH] A6** Report Structure
  - QA report identifies 11 layout issues including deep nesting that must be addressed before build.
  - Evidence: `qa-report.json:7,14`
  - Fix: Integrate 'novamira/adrians-patch-element-styles' automatically if auto-fixable.
- **[MEDIUM] A1** Robustness/Resumability
  - Checkpointing depends on external library, but robust retry mechanisms for individual steps are not explicitly visible in the main loop structure.
  - Evidence: `wizard.js:47 (runFile wrapper)`
  - Fix: Integrate explicit try-catch-resume logic around each phase in the main loop based on checkpoint state.
- **[MEDIUM] A3** Performance/Coverage
  - Visual QA uses hardcoded breakpoints and lacks automated image comparison algorithms (only basic DOM checks).
  - Evidence: `visual-qa.js:77-81`
  - Fix: Replace simple DOM checks with visual regression testing (pixelmatch) for true QA coverage.
- **[MEDIUM] A4** Atomic Write Implementation
  - Atomic write via temporary file + rename is implemented as a placeholder/doc block, needs verification in production.
  - Evidence: `scripts/lib/checkpoint.js:107`
  - Fix: Complete the implementation of the atomic write method to ensure integrity of .pipeline-state.json.
- **[MEDIUM] A5** Test Coverage
  - Tests utilize Node's built-in test runner which is efficient, but testing relies on wrapping shell commands rather than unit testing internal pipeline logic.
  - Evidence: `tests/pipeline.test.js:37`
  - Fix: Migrate from shell-execution-based tests to functional imports for better mocking and assertions.
- **[MEDIUM] A7** Version Mismatch
  - package.json lists version 0.3.1, while SESSION-STATE.md declares current architecture as v0.6.0.
  - Evidence: `package.json:3; SESSION-STATE.md:1`
  - Fix: Update package.json version to 0.6.0 to match the documented reality.
- **[LOW] A8** Onboarding Completeness
  - README.md provides a clear overview and quickstart, but relies on SESSION-STATE.md for crucial architectural context (e.g., the move to MCP-only communication).
  - Evidence: `README.md:16; SESSION-STATE.md:27`
  - Fix: Add a prominent link to SESSION-STATE.md inside README.md to ensure new users understand the MCP-connector architecture.

### B-V2-Plugin (Atomic Widgets) — 1 Finding(s)

- **[LOW] B4** Registration Logic
  - Uses a hybrid approach of trait inheritance for data helpers and static methods for widget registration.
  - Evidence: `includes/abilities/atomic/class-atomic-widgets.php line 45`
  - Fix: Ensure atomic-specific validation logic is centralized to maintain responsive and type consistency across `e-heading`, `e-paragraph`, etc.

### B-V2-Plugin (Auditing Capabilities) — 1 Finding(s)

- **[MEDIUM] B6** Output Structure
  - Visual QA processes full Elementor data but does not explicitly handle potential memory exhaustion when auditing large, complex JSON trees.
  - Evidence: `includes/abilities/audit/class-visual-qa.php:67`
  - Fix: Apply recursion limits or depth-based validation when traversing the Elementor data tree.

### B-V2-Plugin (Bootstrap & Categories) — 1 Finding(s)

- **[LOW] B2** Registration Pattern
  - Registration is deferred to `wp_abilities_api_init` and `wp_abilities_api_categories_init`, allowing error isolation via try-catch blocks.
  - Evidence: `includes/bootstrap.php line 12`
  - Fix: Maintain this lazy-loading pattern to prevent single-domain initialization failures from crashing the entire loader.

### B-V2-Plugin (Custom Code Injection) — 1 Finding(s)

- **[HIGH] B9** XSS-risk
  - CSS sanitization logic exists, but 'add-custom-js' directly registers an HTML widget capable of raw JS injection without further review.
  - Evidence: `includes/abilities/custom-code/class-custom-code.php:56`
  - Fix: Implement capability-based restrictions (e.g., `unfiltered_html`) strictly for all JS-related abilities.

### B-V2-Plugin (Elementor Page/Element Manipulation) — 1 Finding(s)

- **[HIGH] B5** Input Validation
  - The page_js input accepts raw strings to be appended as HTML widgets with <script> tags, creating a direct XSS risk if input is not sanitized or restricted.
  - Evidence: `includes/abilities/elementor/class-batch-build-page.php:36`
  - Fix: Implement strict output encoding or disallow <script> tags for page_js injection.

### B-V2-Plugin (Global Classes / Variables Management) — 1 Finding(s)

- **[LOW] B11** Naming Conflict Strategy
  - Implemented explicit conflict resolution strategy (skip/overwrite/rename) in batch creation, reducing risk of accidental data loss.
  - Evidence: `includes/abilities/variables/class-batch-create-variables.php:33`
  - Fix: Ensure 'rename' logic handles potential collisions with existing entities comprehensively.

### B-V2-Plugin (Main Bootstrap) — 2 Finding(s)

- **[HIGH] B1** Permission Callback
  - The `novamira_permission_callback` was not found in the initial file header/bootstrap; it appears the system uses standard WP capability checks.
  - Evidence: `novamira-adrianv2.php scanning (header level)`
  - Fix: Verify where the requested `novamira_permission_callback` is defined if it is intended to be a global middleware. (Known: 67 references in ability classes, defined in Novamira 1.6.0 plugin)
- **[LOW] B1** Activation/Hooks
  - System relies on `wp_abilities_api_init` hooks triggered dynamically by the core Novamira framework.
  - Evidence: `novamira-adrianv2.php line 60-75`
  - Fix: Ensure formal plugin activation hooks are implemented to handle dependency verification upon plugin enabling.

### B-V2-Plugin (Media Management) — 1 Finding(s)

- **[HIGH] B7** File-type validation
  - The tool accepts base64 content and a filename from input, but lacks explicit server-side validation of the base64 content against the claimed file extension to prevent MIME-type spoofing.
  - Evidence: `includes/abilities/media/class-media-upload.php:48`
  - Fix: Validate file content against its extension using finfo_buffer or similar to ensure the file type matches the requested extension.

### B-V2-Plugin (PHP Sandbox) — 1 Finding(s)

- **[HIGH] B8** Security Model
  - The system relies on external 'PHP_Sandbox_Validator' and 'PHP_Sandbox_Store' classes. It does not contain its own execution isolation logic, instead delegating code execution to unknown underlying implementation.
  - Evidence: `includes/abilities/php-sandbox/class-php-snippets.php:57`
  - Fix: Audit external dependency NickWebdesign\Adrians\PHP_Sandbox_Validator for usage of dangerous functions (e.g., eval, system) and ensure it enforces restricted namespace isolation.

### B-V2-Plugin (SEO Tooling) — 1 Finding(s)

- **[LOW] B10** Extraction Quality
  - Keyword extraction relies on the helper 'V4_Content_Extractor'. If this external logic improperly parses HTML entities, it could lead to poor metadata generation.
  - Evidence: `includes/abilities/seo/class-seo.php:79`
  - Fix: Validate extraction output against known malformed content samples to ensure stable metadata generation.

### B-V2-Plugin (Shared Helpers) — 1 Finding(s)

- **[LOW] B3** Typing/DRY
  - Clean separation of concern for prop building using static helper methods for type casting.
  - Evidence: `includes/helpers/class-v4-props.php class V4_Props`
  - Fix: None, implementation is consistent and DRY.

### B-V2-Plugin (Utility Abilities) — 1 Finding(s)

- **[LOW] B12** Template Consistency
  - Hello_World acts as a functional boilerplate, consistently structured with registration, input/output schema, and meta annotations.
  - Evidence: `includes/abilities/utilities/class-hello-world.php:17-64`
  - Fix: Maintain this structure as the standard template for new abilities.

### C-Cross — 4 Finding(s)

- **[MEDIUM] C3** Lack of Explicit Transport Layer Handling
  - Since network calls are offloaded to an explicit agent-based flow, the 'Error Chain' is now effectively an 'Agent-Instruction Chain'.
  - Evidence: `scripts/lib/mcp-bridge.js:33-40`
  - Fix: Formalize the error response format that generated JSON plans must follow to allow the agent to triage failures effectively.
- **[LOW] C1** Stub Implementation
  - McpBridge successfully decoupled from HTTP; now acts strictly as a stub that enforces agent-managed MCP execution.
  - Evidence: `scripts/lib/mcp-bridge.js:19-21`
  - Fix: Maintain the current pattern of generating MCP-JSON plans as the interface for agent-based execution.
- **[LOW] C2** Schema Integrity
  - Schema is well-defined regarding $$type mapping and server normalization constraints, reducing drift risk.
  - Evidence: `schemas/v4-prop-type-schema.json:1-9`
  - Fix: Ensure class-v4-props.php is synchronized with this JSON schema when properties are updated.
- **[LOW] C4** Proposed Status
  - No code yet. Registry service would be beneficial to force convergence of schemas across separate repositories (Pipeline vs WordPress).
  - Evidence: `N/A`
  - Fix: Define a shared git submodule or central JSON-REST service to serve v4-prop-type-schema.json as a single source of truth for both repos.

### D-Security (Audit Ability Interface) — 1 Finding(s)

- **[LOW] D3** Consistency
  - Registry methods and meta-annotation patterns are consistent across audit classes, ensuring uniform ability registration.
  - Evidence: `includes/abilities/audit/class-class-audit.php:14-63; includes/abilities/audit/class-layout-audit.php:26-75`
  - Fix: Ensure return formats in output_schema remain strictly typed and consistent across all audit suite modules.

### D-Security (CI/CD Pipeline Analysis) — 1 Finding(s)

- **[MEDIUM] D2** Linting Config
  - No ESLint or related front-end linting configurations detected.
  - Evidence: `SAST config check results — none found`
  - Fix: Implement ESLint with predefined rulesets (incl. eslint-plugin-security) for standardized JavaScript/TypeScript quality metrics.

### D-Security (Media Upload Abilities) — 1 Finding(s)

- **[HIGH] D6** filename sanitization
  - Input schema accepts 'filename' string directly without evidence of sanitization or extension validation prior to processing.
  - Evidence: `includes/abilities/media/class-media-upload.php:25`
  - Fix: Implement strict whitelist of allowed file extensions and sanitize 'filename' input using sanitize_file_name().

### D-Security (Runtime Security and Sandboxing) — 1 Finding(s)

- **[MEDIUM] D4** Blacklist strategy
  - Uses a comprehensive blocklist of dangerous functions coupled with token parsing as a primary security layer.
  - Evidence: `includes/helpers/class-php-sandbox-validator.php:38-75`
  - Fix: Supplement the function blocklist with an allowlist approach for higher sensitivity environments, acknowledging the inherent limitations of static analysis for remote code execution prevention.

### D-Security (Static Analysis Integration) — 1 Finding(s)

- **[HIGH] D1** Config Presence
  - No SAST configuration files (phpstan.neon, psalm.xml, .semgrep.yml) found in the project root.
  - Evidence: `SAST config check results — none found`
  - Fix: Integrate a standardized static analysis tool with appropriate configuration files to ensure code quality. Recommended: Psalm with --taint-analysis for XSS/SQLi detection.

### D-Security (permission_callback usage) — 1 Finding(s)

- **[MEDIUM] D5** permission_callback standardization
  - Extensive use (n=67) of a singular global callback function 'novamira_permission_callback' across diverse ability modules (a11y, atomic, audit, custom-code, elementor). Single point of failure.
  - Evidence: `grep output across includes/abilities/ — 67 matches`
  - Fix: Transition to capability-specific callbacks to follow Principle of Least Privilege, reducing impact surface if the central callback logic is flawed.

### E-Performance — 1 Finding(s)

- **[HIGH] E5** N+1 problem
  - Visual QA script iterates through breakpoints but lacks explicit meta-query batching for post-data retrieval.
  - Evidence: `scripts/visual-qa.js`
  - Fix: Implement batch metadata fetching if retrieving data for multiple post_ids concurrently. Use get_post_meta with object caching.

### E-Performance (Diagnostics helper) — 1 Finding(s)

- **[MEDIUM] E2** diagnostics logging
  - Diagnostics::record() captures Throwable metadata (message, file, line) for ability registration failures but does not measure execution time or memory utilization.
  - Evidence: `includes/helpers/class-diagnostics.php:24`
  - Fix: Extend Diagnostics::record() to track execution timing using microtime(true) and memory_get_peak_usage() to identify performance bottlenecks per ability.

### F-A11y — 2 Finding(s)

- **[HIGH] F1** axe-core presence
  - Axe-core is not integrated. visual-qa.js focuses on functional DOM checks (e.g., 404 image detection, error classes). No pa11y/lighthouse/wcag references found.
  - Evidence: `scripts/visual-qa.js; package.json — no axe/pa11y/lighthouse dependencies`
  - Fix: Inject axe-core into the Playwright/Puppeteer browser instance within visual-qa.js for automated accessibility regression. Add as npm dependency.
- **[MEDIUM] F2** WCAG versioning
  - The codebase explicitly references WCAG 2.1; WCAG 2.2 features are currently unsupported by the static helper class.
  - Evidence: `includes/helpers/class-v4-color-contrast.php:12`
  - Fix: Update relative_luminance and contrast math to support 2.2 additions (Target Size 2.5.8, Focus Appearance 2.4.11).

### F-A11y (V4_Color_Contrast implementation) — 1 Finding(s)

- **[MEDIUM] F7** WCAG standard compliance
  - V4_Color_Contrast implements WCAG 2.1 relative-luminance and contrast-ratio definitions, not 2.2. Constants AA_NORMAL, AA_LARGE, AAA_NORMAL, AAA_LARGE present but 2.2-specific rules missing.
  - Evidence: `includes/helpers/class-v4-color-contrast.php:12-14, 32-41`
  - Fix: Update implementation to support WCAG 2.2 standards if required. Also add UI diff capability for fix-color-contrast (apply:true) to show before/after.

### F-A11y (audit-page-a11y implementation) — 1 Finding(s)

- **[MEDIUM] F4** audit-page-a11y functionality
  - The audit-page-a11y tool provides a WCAG-oriented report checking contrast, alt text, heading hierarchy, link text, and form labels. Contrast resolution is described as 'best-effort,' indicating it is inconclusive when the background cannot be resolved.
  - Evidence: `includes/abilities/a11y/class-a11y.php:7-17, 141`
  - Fix: Expose the logic used for background resolution in 'best-effort' contrast checks to allow auditing the accuracy of the automated findings. Consider server-side axe integration.

### C-Cross (PROPOSED) — 2 Finding(s)

- **[MEDIUM] C5** Architecture
  - Proposed extension for offloading heavy PHP tasks from the main plugin process, potentially enhancing stability.
  - Evidence: `N/A (no code yet)`
  - Fix: Evaluate inter-process communication (IPC) overhead versus the performance gain of offloading.
- **[MEDIUM] C6** Data Storage
  - Proposed replacement for current JSON-based persistence to improve query performance and data integrity.
  - Evidence: `N/A (no code yet)`
  - Fix: Ensure compatibility with WPE/shared hosting environments that might restrict SQLite file creation.

### D-Security (PROPOSED) — 1 Finding(s)

- **[MEDIUM] D7** patchstack/wpscan integration
  - PROPOSED - no code yet. Trade-off analysis required for API rate limits vs real-time security scanning.
  - Evidence: `N/A`
  - Fix: Develop a service provider to integrate with Patchstack API for scheduled vulnerability checks against composer.lock + active plugin directory.

### E-Performance (PROPOSED) — 4 Finding(s)

- **[MEDIUM] E1** profiling infrastructure
  - PROPOSED - no code yet.
  - Evidence: `N/A`
  - Fix: Configure Clinic.js setup or Node.js --inspect hooks for performance profiling in non-prod environments. Identifies which of 18 phases dominates runtime.
- **[MEDIUM] E3** latency monitoring
  - PROPOSED - no code yet.
  - Evidence: `N/A`
  - Fix: Implement interceptor to measure time between request dispatch and response receipt for MCP commands. Log avg/p95/p99 per ability.
- **[MEDIUM] E4** Batched vs single call
  - Tree splitting logic implements chunking based on element count to mitigate large-payload issues.
  - Evidence: `scripts/lib/split-large-tree.js:93`
  - Fix: Benchmark overhead of batch transition vs atomic processing for Elementor widget injection. Target: 20-50x speedup via batch-build-page (per IMPROVEMENT-PLAN Phase 2.1).
- **[MEDIUM] E6** Memory usage
  - No explicit memory monitoring for node-based QA processes.
  - Evidence: `scripts/visual-qa.js`
  - Fix: Integrate process.memoryUsage() alerts in the QA pipeline during large page audits. Consider stream-processing for large Elementor trees.

### F-A11y (PROPOSED) — 3 Finding(s)

- **[HIGH] F3** A11y-CI coverage
  - Missing automated A11y regression tests in CI; only basic UI sanity checks are performed.
  - Evidence: `scripts/visual-qa.js:20-30`
  - Fix: Add an A11y-audit step to the pipeline utilizing existing browser automation infrastructure. Recommend pa11y-ci or axe-CI with JSON/HTML reports.
- **[HIGH] F6** ARIA semantics audit
  - Proposed item not currently implemented in the analyzed classes.
  - Evidence: `N/A`
  - Fix: Add a validation layer for ARIA roles, aria-labels, aria-describedby, and live-regions to ensure screen-reader compatibility.
- **[MEDIUM] F5** Keyboard navigation audit
  - Proposed item not currently implemented in the analyzed classes.
  - Evidence: `N/A`
  - Fix: Implement automated tests for tab order, focus-visible states, and skip-link presence using Playwright keyboard navigation API.

---

## 4. Quick-Wins vs Long-Term (Aufwandsschätzung)

### ⚡ Quick-Wins (24 Findings, Effort: Trivial-Small)

Sofort umsetzbar, oft < 1 Tag Aufwand. Empfohlen für die nächste Sprint-Iteration.

- **A2** (Trivial (<1h)) — Validation Threshold
  - Parameterize the 85% threshold to allow environment-specific CI tuning.
- **B1** (Small (1-2h)) — Permission Callback
  - Verify where the requested `novamira_permission_callback` is defined if it is intended to be a global middleware. (Known: 67 references in ability classes, defined in Novamira 1.6.0 plugin)
- **B5** (Small (1-2h)) — Input Validation
  - Implement strict output encoding or disallow <script> tags for page_js injection.
- **B7** (Small (1-2h)) — File-type validation
  - Validate file content against its extension using finfo_buffer or similar to ensure the file type matches the requested extension.
- **B8** (Small (1-2h)) — Security Model
  - Audit external dependency NickWebdesign\Adrians\PHP_Sandbox_Validator for usage of dangerous functions (e.g., eval, system) and ensure it enforces restricted namespace isolation.
- **B9** (Small (1-2h)) — XSS-risk
  - Implement capability-based restrictions (e.g., `unfiltered_html`) strictly for all JS-related abilities.
- **D1** (Small (1-2h)) — Config Presence
  - Integrate a standardized static analysis tool with appropriate configuration files to ensure code quality. Recommended: Psalm with --taint-analysis for XSS/SQLi detection.
- **D6** (Small (1-2h)) — filename sanitization
  - Implement strict whitelist of allowed file extensions and sanitize 'filename' input using sanitize_file_name().
- **E5** (Small (1-2h)) — N+1 problem
  - Implement batch metadata fetching if retrieving data for multiple post_ids concurrently. Use get_post_meta with object caching.
- **F1** (Small (1-2h)) — axe-core presence
  - Inject axe-core into the Playwright/Puppeteer browser instance within visual-qa.js for automated accessibility regression. Add as npm dependency.
- **A1** (Small (1-2h)) — Robustness/Resumability
  - Integrate explicit try-catch-resume logic around each phase in the main loop based on checkpoint state.
- **A7** (Trivial (<1h)) — Version Mismatch
  - Update package.json version to 0.6.0 to match the documented reality.
- **D4** (Small (1-2h)) — Blacklist strategy
  - Supplement the function blocklist with an allowlist approach for higher sensitivity environments, acknowledging the inherent limitations of static analysis for remote code execution prevention.
- **A8** (Trivial (<1h)) — Onboarding Completeness
  - Add a prominent link to SESSION-STATE.md inside README.md to ensure new users understand the MCP-connector architecture.
- **B1** (Trivial (<1h)) — Activation/Hooks
  - Ensure formal plugin activation hooks are implemented to handle dependency verification upon plugin enabling.

### 🔧 Medium-Term (12 Findings, Effort: 1-2 Tage)

- **A6** (Medium (1-2d)) — Report Structure
  - Integrate 'novamira/adrians-patch-element-styles' automatically if auto-fixable.
- **A3** (Medium (1-2d)) — Performance/Coverage
  - Replace simple DOM checks with visual regression testing (pixelmatch) for true QA coverage.
- **A4** (Medium (1-2d)) — Atomic Write Implementation
  - Complete the implementation of the atomic write method to ensure integrity of .pipeline-state.json.
- **A5** (Medium (1-2d)) — Test Coverage
  - Migrate from shell-execution-based tests to functional imports for better mocking and assertions.
- **B6** (Medium (1-2d)) — Output Structure
  - Apply recursion limits or depth-based validation when traversing the Elementor data tree.
- **C3** (Medium (1-2d)) — Lack of Explicit Transport Layer Handling
  - Formalize the error response format that generated JSON plans must follow to allow the agent to triage failures effectively.
- **D2** (Medium (1-2d)) — Linting Config
  - Implement ESLint with predefined rulesets (incl. eslint-plugin-security) for standardized JavaScript/TypeScript quality metrics.
- **D5** (Medium (1-2d)) — permission_callback standardization
  - Transition to capability-specific callbacks to follow Principle of Least Privilege, reducing impact surface if the central callback logic is flawed.
- **E2** (Medium (1-2d)) — diagnostics logging
  - Extend Diagnostics::record() to track execution timing using microtime(true) and memory_get_peak_usage() to identify performance bottlenecks per ability.
- **F2** (Medium (1-2d)) — WCAG versioning
  - Update relative_luminance and contrast math to support 2.2 additions (Target Size 2.5.8, Focus Appearance 2.4.11).
- **F4** (Medium (1-2d)) — audit-page-a11y functionality
  - Expose the logic used for background resolution in 'best-effort' contrast checks to allow auditing the accuracy of the automated findings. Consider server-side axe integration.
- **F7** (Medium (1-2d)) — WCAG standard compliance
  - Update implementation to support WCAG 2.2 standards if required. Also add UI diff capability for fix-color-contrast (apply:true) to show before/after.

### 🏗️ Long-Term / Architektur (11 Findings, Effort: 1-2 Wochen)

- **F3** (Large (1-2 weeks)) — A11y-CI coverage
  - Add an A11y-audit step to the pipeline utilizing existing browser automation infrastructure. Recommend pa11y-ci or axe-CI with JSON/HTML reports.
- **F6** (Large (1-2 weeks)) — ARIA semantics audit
  - Add a validation layer for ARIA roles, aria-labels, aria-describedby, and live-regions to ensure screen-reader compatibility.
- **C5** (Large (1-2 weeks)) — Architecture
  - Evaluate inter-process communication (IPC) overhead versus the performance gain of offloading.
- **C6** (Large (1-2 weeks)) — Data Storage
  - Ensure compatibility with WPE/shared hosting environments that might restrict SQLite file creation.
- **D7** (Large (1-2 weeks)) — patchstack/wpscan integration
  - Develop a service provider to integrate with Patchstack API for scheduled vulnerability checks against composer.lock + active plugin directory.
- **E1** (Large (1-2 weeks)) — profiling infrastructure
  - Configure Clinic.js setup or Node.js --inspect hooks for performance profiling in non-prod environments. Identifies which of 18 phases dominates runtime.
- **E3** (Large (1-2 weeks)) — latency monitoring
  - Implement interceptor to measure time between request dispatch and response receipt for MCP commands. Log avg/p95/p99 per ability.
- **E4** (Large (1-2 weeks)) — Batched vs single call
  - Benchmark overhead of batch transition vs atomic processing for Elementor widget injection. Target: 20-50x speedup via batch-build-page (per IMPROVEMENT-PLAN Phase 2.1).
- **E6** (Large (1-2 weeks)) — Memory usage
  - Integrate process.memoryUsage() alerts in the QA pipeline during large page audits. Consider stream-processing for large Elementor trees.
- **F5** (Large (1-2 weeks)) — Keyboard navigation audit
  - Implement automated tests for tab order, focus-visible states, and skip-link presence using Playwright keyboard navigation API.
- **C4** (Large (1-2 weeks)) — Proposed Status
  - Define a shared git submodule or central JSON-REST service to serve v4-prop-type-schema.json as a single source of truth for both repos.

---

## 5. Decision-Matrix (Impact vs Effort)

| Item | Impact | Effort | Phase-Empfehlung |
|------|--------|--------|------------------|
| A2 | high | Trivial (<1h) | Phase 0 (sofort) |
| A6 | high | Medium (1-2d) | Phase 1-2 (nächste 2 Wochen) |
| B1 | high | Small (1-2h) | Phase 1 (diese Woche) |
| B5 | high | Small (1-2h) | Phase 1 (diese Woche) |
| B7 | high | Small (1-2h) | Phase 1 (diese Woche) |
| B8 | high | Small (1-2h) | Phase 1 (diese Woche) |
| B9 | high | Small (1-2h) | Phase 1 (diese Woche) |
| D1 | high | Small (1-2h) | Phase 1 (diese Woche) |
| D6 | high | Small (1-2h) | Phase 1 (diese Woche) |
| E5 | high | Small (1-2h) | Phase 1 (diese Woche) |
| F1 | high | Small (1-2h) | Phase 1 (diese Woche) |
| F3 | high | Large (1-2 weeks) | Phase 2 (Monat) — Quick-Projekt |
| F6 | high | Large (1-2 weeks) | Phase 2 (Monat) — Quick-Projekt |
| A1 | medium | Small (1-2h) | Phase 1-2 (nächste 2 Wochen) |
| A3 | medium | Medium (1-2d) | Phase 2-3 (Monat) |
| A4 | medium | Medium (1-2d) | Phase 2-3 (Monat) |
| A5 | medium | Medium (1-2d) | Phase 2-3 (Monat) |
| A7 | medium | Trivial (<1h) | Phase 1 (diese Woche) |
| B6 | medium | Medium (1-2d) | Phase 2-3 (Monat) |
| C3 | medium | Medium (1-2d) | Phase 2-3 (Monat) |
| C5 | medium | Large (1-2 weeks) | Phase 3+ (Quartal) |
| C6 | medium | Large (1-2 weeks) | Phase 3+ (Quartal) |
| D2 | medium | Medium (1-2d) | Phase 2-3 (Monat) |
| D4 | medium | Small (1-2h) | Phase 1-2 (nächste 2 Wochen) |
| D5 | medium | Medium (1-2d) | Phase 2-3 (Monat) |
| D7 | medium | Large (1-2 weeks) | Phase 3+ (Quartal) |
| E1 | medium | Large (1-2 weeks) | Phase 3+ (Quartal) |
| E2 | medium | Medium (1-2d) | Phase 2-3 (Monat) |
| E3 | medium | Large (1-2 weeks) | Phase 3+ (Quartal) |
| E4 | medium | Large (1-2 weeks) | Phase 3+ (Quartal) |
| E6 | medium | Large (1-2 weeks) | Phase 3+ (Quartal) |
| F2 | medium | Medium (1-2d) | Phase 2-3 (Monat) |
| F4 | medium | Medium (1-2d) | Phase 2-3 (Monat) |
| F5 | medium | Large (1-2 weeks) | Phase 3+ (Quartal) |
| F7 | medium | Medium (1-2d) | Phase 2-3 (Monat) |
| A8 | low | Trivial (<1h) | Backlog |
| B1 | low | Trivial (<1h) | Backlog |
| B10 | low | Trivial (<1h) | Backlog |
| B11 | low | Trivial (<1h) | Backlog |
| B12 | low | Trivial (<1h) | Backlog |
| B2 | low | Small (1-2h) | Backlog |
| B3 | low | Trivial (<1h) | Backlog |
| B4 | low | Trivial (<1h) | Backlog |
| C1 | low | Trivial (<1h) | Backlog |
| C2 | low | Trivial (<1h) | Backlog |
| C4 | low | Large (1-2 weeks) | Skip / Re-evaluate |
| D3 | low | Trivial (<1h) | Backlog |

---

## 6. Per-Item Coverage

| Item | Block | Findings | Status |
|------|-------|----------|--------|
| A1 | A-Pipeline | 1 | ✅ done |
| A2 | A-Pipeline | 1 | ✅ done |
| A3 | A-Pipeline | 1 | ✅ done |
| A4 | A-Pipeline | 1 | ✅ done |
| A5 | A-Pipeline | 1 | ✅ done |
| A6 | A-Pipeline | 1 | ✅ done |
| A7 | A-Pipeline | 1 | ✅ done |
| A8 | A-Pipeline | 1 | ✅ done |
| B1 | B-V2-Plugin (Main Bootstrap) | 2 | ✅ done |
| B10 | B-V2-Plugin (SEO Tooling) | 1 | ✅ done |
| B11 | B-V2-Plugin (Global Classes / Variables Management) | 1 | ✅ done |
| B12 | B-V2-Plugin (Utility Abilities) | 1 | ✅ done |
| B2 | B-V2-Plugin (Bootstrap & Categories) | 1 | ✅ done |
| B3 | B-V2-Plugin (Shared Helpers) | 1 | ✅ done |
| B4 | B-V2-Plugin (Atomic Widgets) | 1 | ✅ done |
| B5 | B-V2-Plugin (Elementor Page/Element Manipulation) | 1 | ✅ done |
| B6 | B-V2-Plugin (Auditing Capabilities) | 1 | ✅ done |
| B7 | B-V2-Plugin (Media Management) | 1 | ✅ done |
| B8 | B-V2-Plugin (PHP Sandbox) | 1 | ✅ done |
| B9 | B-V2-Plugin (Custom Code Injection) | 1 | ✅ done |
| C1 | C-Cross | 1 | ✅ done |
| C2 | C-Cross | 1 | ✅ done |
| C3 | C-Cross | 1 | ✅ done |
| C4 | C-Cross | 1 | ✅ done |
| C5 | C-Cross (PROPOSED) | 1 | ✅ done |
| C6 | C-Cross (PROPOSED) | 1 | ✅ done |
| D1 | D-Security (Static Analysis Integration) | 1 | ✅ done |
| D2 | D-Security (CI/CD Pipeline Analysis) | 1 | ✅ done |
| D3 | D-Security (Audit Ability Interface) | 1 | ✅ done |
| D4 | D-Security (Runtime Security and Sandboxing) | 1 | ✅ done |
| D5 | D-Security (permission_callback usage) | 1 | ✅ done |
| D6 | D-Security (Media Upload Abilities) | 1 | ✅ done |
| D7 | D-Security (PROPOSED) | 1 | ✅ done |
| E1 | E-Performance (PROPOSED) | 1 | ✅ done |
| E2 | E-Performance (Diagnostics helper) | 1 | ✅ done |
| E3 | E-Performance (PROPOSED) | 1 | ✅ done |
| E4 | E-Performance (PROPOSED) | 1 | ✅ done |
| E5 | E-Performance | 1 | ✅ done |
| E6 | E-Performance (PROPOSED) | 1 | ✅ done |
| F1 | F-A11y | 1 | ✅ done |
| F2 | F-A11y | 1 | ✅ done |
| F3 | F-A11y (PROPOSED) | 1 | ✅ done |
| F4 | F-A11y (audit-page-a11y implementation) | 1 | ✅ done |
| F5 | F-A11y (PROPOSED) | 1 | ✅ done |
| F6 | F-A11y (PROPOSED) | 1 | ✅ done |
| F7 | F-A11y (V4_Color_Contrast implementation) | 1 | ✅ done |

---

## 7. Referenzierte Tools (aus supplementary_tools)

- **Security:** PHPStan, Psalm, Semgrep, Patchstack, WP-CLI
- **Performance:** Clinic.js, Blackfire, Tideways, Query Monitor, Node --inspect
- **A11y:** axe-core, Lighthouse, Pa11y-CI, eslint-plugin-jsx-a11y, Accessibility Checker

---

**Report generated:** 2026-06-10 · **Findings:** 47 · **Items:** 46/46 · **Coverage:** 100%
