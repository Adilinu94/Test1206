# Changelog — novamira-adrianv2

## [1.0.0] — 2026-06-12

### Added
- **~40+ MCP-Abilities** in 11 Kategorien (elementor, media, audit, atomic, a11y, custom-code, global-classes, php-sandbox, seo, utilities, variables)
- `class-build-versioning.php` — CPT `elementor_build` mit Meta-Boxes für Build-Versionierung
- `class-v4-color-contrast-22.php` — WCAG 2.2 Target Size + Focus Appearance
- `class-execute-build-plan.php` — Mega-Ability: 18+ Agent-Turns → 1 MCP-Call
- `resolve_background_color()` — A11y-Methode mit Parent-Chain-Walking
- `fix-color-contrast` Preview-Mode — HTML Side-by-Side Diff
- Bootstrap-System: 11 Sub-Module mit `class_exists` Guards + Auto-Registration
- `psalm.xml` — Psalm Static Analysis Konfiguration

### Changed
- Alle Ability-Namen: `novamira/adrians-*` → `novamira-adrianv2/*` (Breaking Change)
- Namespace: `Novamira\AdrianV2\{Helpers,Abilities\{...}}`
- Permission-Callbacks von `novamira_permission_callback` auf interne Methoden umgestellt

### Fixed
- **B8-CRITICAL:** PHP-Sandbox `is_available()` Bug — prüfte falschen Namespace
- PHP-Sandbox Validator Blacklist aktualisiert (shell_exec, eval, etc.)
- WCAG 2.2 Compliance in Color-Contrast-Prüfung

### Infrastructure
- `composer.json` — Dependency-Management + Autoloading
- `phpcs.xml` — WordPress Coding Standards + PHP 8.0+ Compatibility
- `mcp-server-config.example.json` — Beispiel-Konfiguration für MCP Server

### Deprecated
- `class-convert-kit-to-v4.php` → `_deprecated/`
