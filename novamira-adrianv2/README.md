# Novamira AdrianV2

> WordPress Plugin — MCP-Abilities für Elementor V4, Media, Audit, SEO & mehr

**Version:** 1.0.0  
**Requires:** PHP 8.0+, WordPress 6.4+, [Novamira](https://novamira.dev), Elementor 4.x  
**License:** GPL-2.0-or-later

---

## Übersicht

Novamira AdrianV2 ist das **Fähigkeiten-Plugin** für den Novamira MCP Server auf solar.local. Es stellt ~40+ MCP-Abilities bereit, die von KI-Agenten (Claude, Codebuff) über JSON-RPC 2.0 aufgerufen werden können.

### Architektur

```
novamira-adrianv2/
├── novamira-adrianv2.php              # Main Plugin File
├── includes/
│   ├── bootstrap.php                  # Ability-Registrierung (11 Sub-Module)
│   ├── categories.php                 # Ability-Kategorien
│   ├── class-build-versioning.php     # Build-Versionierung (CPT elementor_build)
│   ├── helpers/                       # 14 Hilfsklassen
│   └── abilities/
│       ├── a11y/          (2)         # Accessibility-Prüfung
│       ├── atomic/        (3)         # V4 Atomic Widgets
│       ├── audit/         (7)         # QA & Audit-Tools
│       ├── custom-code/   (2)         # Code-Snippet-Injection
│       ├── elementor/     (29)        # Elementor-Kernfunktionen
│       ├── global-classes/(2)         # Global Classes
│       ├── media/         (8)         # Media Library
│       ├── php-sandbox/   (2)         # PHP-Sandbox (Code-Ausführung)
│       ├── seo/           (2)         # SEO-Meta
│       ├── utilities/     (2)         # Utilities & Diagnostics
│       └── variables/     (2)         # Global Variables
```

---

## Abilities (Auswahl)

### 🔧 Elementor Core

| Ability | Beschreibung |
|---------|-------------|
| `novamira-adrianv2/setup-v4-foundation` | V4-Kit-Grundstruktur anlegen (Variables, GCs) |
| `novamira-adrianv2/batch-build-page` | Batch-Build von Atomic Widget Trees |
| `novamira-adrianv2/patch-element-styles` | Styles an bestehenden Elementen patchen |
| `novamira-adrianv2/export-design-system` | Design-System exportieren (read-only) |
| `novamira-adrianv2/import-design-system` | Design-System importieren |
| `novamira-adrianv2/execute-build-plan` | Mega-Ability: 1 Call statt 18+ Agent-Turns |

### 🎨 Global Classes & Variables

| Ability | Beschreibung |
|---------|-------------|
| `novamira-adrianv2/batch-class` | Global Classes erstellen/aktualisieren |
| `novamira-adrianv2/add-global-class-variant` | Varianten pro Breakpoint hinzufügen |
| `novamira-adrianv2/apply-variable-to-class` | GV-ID an Global Class binden |
| `novamira-adrianv2/batch-create-variables` | Global Variables batch-erstellen |

### 🔍 Audit & QA

| Ability | Beschreibung |
|---------|-------------|
| `novamira-adrianv2/layout-audit` | DOM-Tiefe, Nesting, Overflow prüfen |
| `novamira-adrianv2/visual-qa` | Visuelle QA (Contrast, Spacing) |
| `novamira-adrianv2/responsive-audit` | Breakpoint-Coverage prüfen |
| `novamira-adrianv2/variable-audit` | GV-ID Drift Detection |
| `novamira-adrianv2/class-audit` | Ungenutzte Global Classes finden |
| `novamira-adrianv2/page-audit` | SEO + Performance + A11y |

### 🖼️ Media

| Ability | Beschreibung |
|---------|-------------|
| `novamira-adrianv2/batch-media-upload` | 30 Dateien/Batch, 10MB/Datei |
| `novamira-adrianv2/media-upload` | Einzel-Upload |
| `novamira-adrianv2/list-media` | Media Library durchsuchen |

---

## Installation

```bash
# 1. Plugin in WordPress installieren
wp plugin install /pfad/zu/novamira-adrianv2.zip --activate

# 2. Composer dependencies (optional)
cd wp-content/plugins/novamira-adrianv2
composer install --no-dev

# 3. PHP CodeSniffer (Dev only)
composer install
./vendor/bin/phpcs --standard=phpcs.xml
```

---

## Entwicklung

```bash
# Linting
composer lint

# Auto-Fix
composer lint:fix

# Statische Analyse
composer analyze

# Tests (in Arbeit)
composer test
```

### Coding Standards

- PHP 8.0+, WordPress Coding Standards
- Namespace: `Novamira\AdrianV2\{Helpers,Abilities\{...}}`
- Bootstrap-Pattern: `class_exists` Guard + `require_once` + `Adrians_Registry::register()`

---

## Abhängigkeiten

- **[Novamira](https://novamira.dev)** — MCP Server Basis-Plugin
- **[Elementor](https://elementor.com)** 4.x — Page Builder
- **[Psalm](https://psalm.dev)** (Dev) — Statische Analyse
- **[PHP_CodeSniffer](https://github.com/squizlabs/PHP_CodeSniffer)** (Dev) — Coding Standards

---

## Changelog

Siehe [CHANGELOG.md](./CHANGELOG.md)
