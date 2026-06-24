#!/usr/bin/env node
/**
 * scripts/lib/pro-fallback.js  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 4.3 — Pro-Feature-Generics.
 *
 * Map: Pro-Widget → Generic-Atomic-Equivalent.
 * Wird in convert-xml-to-v4.js integriert, sodass bei Pro-Component
 * automatisch der Fallback angewendet wird (wenn Pro nicht aktiv).
 *
 * Pro-Widgets in Elementor 4.x:
 *   - Loop-Grid      → e-flexbox + e-paragraph × N (statische Inhalte)
 *   - Form           → e-flexbox + Hinweis "Pro required"
 *   - Nav-Menu       → e-flexbox mit statischen Links
 *   - Popup          → Hinweis im Build-Report
 *   - Theme-Template → e-flexbox + Pattern-Detection
 *   - Mega-Menu      → wie Nav-Menu
 *   - Search-Form    → e-flexbox + e-button (input fehlt in Generic-Atomic)
 *   - Price-Table    → e-flexbox + e-heading + e-paragraph + e-button
 *   - Slide          → e-flexbox + e-image (statisch, ohne Auto-Slide)
 *   - Countdown      → e-flexbox + e-paragraph (statisches Enddatum)
 *
 * Detection: Wird in convert-xml-to-v4.js pro Framer-Component geprueft.
 * Pro-Status kommt aus elementor-version.js (env.is_pro_active).
 */

const PRO_FALLBACKS = {
  'loop-grid': {
    description: 'Loop-Grid → Statische e-flexbox + e-paragraph-Repeater',
    target_widget: 'e-flexbox',
    children_pattern: 'repeater',
    can_render_static: true,
    degrades_gracefully: true,
  },
  'posts': {
    description: 'Posts-Widget → Statische e-flexbox + e-paragraph (manuell)',
    target_widget: 'e-flexbox',
    children_pattern: 'manual',
    can_render_static: true,
    degrades_gracefully: true,
  },
  'form': {
    description: 'Form-Widget → Hinweis-Box "Pro required"',
    target_widget: 'e-flexbox',
    children_pattern: 'notice',
    notice: 'Diese Section enthaelt ein Formular. Elementor Pro ist erforderlich, um Formulare zu rendern. Bitte Pro aktivieren oder das Formular durch ein externes Formular-Plugin ersetzen.',
    can_render_static: true,
    degrades_gracefully: false,
  },
  'nav-menu': {
    description: 'Nav-Menu → e-flexbox mit statischen Links',
    target_widget: 'e-flexbox',
    children_pattern: 'menu-static',
    can_render_static: true,
    degrades_gracefully: true,
  },
  'mega-menu': {
    description: 'Mega-Menu → wie Nav-Menu',
    target_widget: 'e-flexbox',
    children_pattern: 'menu-static',
    can_render_static: true,
    degrades_gracefully: true,
  },
  'search-form': {
    description: 'Search-Form → e-flexbox + e-button (Such-Input ist nicht generisch)',
    target_widget: 'e-flexbox',
    children_pattern: 'search-static',
    can_render_static: true,
    degrades_gracefully: false,
  },
  'price-table': {
    description: 'Price-Table → e-flexbox + e-heading + e-paragraph + e-button',
    target_widget: 'e-flexbox',
    children_pattern: 'pricing-static',
    can_render_static: true,
    degrades_gracefully: true,
  },
  'slide': {
    description: 'Slide/Carousel → Statische e-flexbox (ohne Auto-Animation)',
    target_widget: 'e-flexbox',
    children_pattern: 'slide-static',
    can_render_static: true,
    degrades_gracefully: false,
  },
  'countdown': {
    description: 'Countdown → Statische e-paragraph mit Enddatum',
    target_widget: 'e-paragraph',
    children_pattern: 'date-static',
    can_render_static: true,
    degrades_gracefully: true,
  },
  'theme-template': {
    description: 'Theme-Template (Header/Footer) → e-flexbox + Pattern-Detection',
    target_widget: 'e-flexbox',
    children_pattern: 'template-static',
    can_render_static: true,
    degrades_gracefully: true,
  },
  'popup': {
    description: 'Popup → Hinweis im Build-Report (nicht in Page-Body)',
    target_widget: null,
    children_pattern: 'notice-only',
    notice: 'Popup-Widget gefunden. Popups werden nicht in den Page-Body gerendert — separater Trigger noetig.',
    can_render_static: false,
    degrades_gracefully: false,
  },
  'login': {
    description: 'Login-Form → Hinweis "Pro required"',
    target_widget: 'e-flexbox',
    children_pattern: 'notice',
    notice: 'Login-Form benoetigt Elementor Pro. Bitte alternatives Login-Widget (z.B. Ultimate Member) verwenden.',
    can_render_static: true,
    degrades_gracefully: false,
  },
};

/**
 * Prueft, ob ein Framer-Component ein Pro-Feature ist.
 *
 * @param {Object} component
 * @param {string} component.name - Framer component name (z.B. "Loop Grid", "Form")
 * @param {Object} [component.attrs] - rohe Attribute
 * @returns {{ isProFeature: boolean, fallback: object|null, originalName: string }}
 */
export function detectProFeature(component) {
  if (!component || typeof component !== 'object') {
    return { isProFeature: false, fallback: null, originalName: '' };
  }
  const name = (component.name || component.widgetType || '').toLowerCase().trim();
  const normalized = name.replace(/[\s_-]+/g, '-');

  // Direkter Match
  for (const [key, fallback] of Object.entries(PRO_FALLBACKS)) {
    if (normalized === key || normalized.includes(key) || name.includes(fallback.description.split(' ')[0].toLowerCase())) {
      return {
        isProFeature: true,
        fallback,
        originalName: component.name || component.widgetType || key,
        key,
      };
    }
  }

  return { isProFeature: false, fallback: null, originalName: component.name || '' };
}

/**
 * Wendet den Fallback auf eine V4-Element-Pipeline an.
 *
 * @param {Object} originalComponent - die originale Framer-Component
 * @param {Object} fallback - das Pro-Fallback-Schema aus detectProFeature
 * @returns {Object} v4-element-replacement (oder Hinweis-Marker)
 */
export function applyProFallback(originalComponent, fallback) {
  if (!fallback) return null;

  if (fallback.target_widget === null) {
    // Nur Hinweis (z.B. Popup)
    return {
      type: 'notice',
      widgetType: 'e-html',
      notice: fallback.notice,
      originalName: originalComponent.name,
    };
  }

  if (fallback.children_pattern === 'notice') {
    return {
      type: 'widget',
      elType: 'widget',
      widgetType: fallback.target_widget,
      settings: {
        classes: {
          $$type: 'classes',
          value: [],
        },
      },
      children: [
        {
          type: 'widget',
          elType: 'widget',
          widgetType: 'e-heading',
          settings: {
            title: { $$type: 'string', value: 'Hinweis' },
            tag: { $$type: 'string', value: 'h3' },
          },
        },
        {
          type: 'widget',
          elType: 'widget',
          widgetType: 'e-paragraph',
          settings: {
            paragraph: { $$type: 'string', value: fallback.notice },
          },
        },
      ],
      _meta: {
        is_pro_fallback: true,
        original_widget: originalComponent.name,
        fallback_key: originalComponent._detected_key,
      },
    };
  }

  // Generisches e-flexbox-Wrapper-Element (mit Hinweis, dass Inhalte manuell befuellt werden muessen)
  return {
    type: 'widget',
    elType: 'widget',
    widgetType: fallback.target_widget,
    settings: {
      classes: { $$type: 'classes', value: [] },
    },
    children: [
      {
        type: 'widget',
        elType: 'widget',
        widgetType: 'e-paragraph',
        settings: {
          paragraph: {
            $$type: 'string',
            value: `[Pro-Fallback] ${fallback.description} — bitte manuell befuellen oder Elementor Pro aktivieren.`,
          },
        },
      },
    ],
    _meta: {
      is_pro_fallback: true,
      original_widget: originalComponent.name,
      fallback_key: originalComponent._detected_key,
      children_pattern: fallback.children_pattern,
    },
  };
}

/**
 * Convenience-Wrapper: kombiniert detectProFeature + applyProFallback.
 * Bei is_pro_active=true wird kein Fallback angewendet (Original durchlassen).
 */
export function maybeApplyProFallback(component, { isProActive = false } = {}) {
  const detection = detectProFeature(component);
  if (!detection.isProFeature) return { applied: false, element: null, detection };
  if (isProActive) return { applied: false, element: null, detection, reason: 'pro-active' };

  const element = applyProFallback({ ...component, _detected_key: detection.key }, detection.fallback);
  return { applied: true, element, detection };
}

/**
 * Listet alle bekannten Pro-Features auf (fuer Build-Report).
 */
export function listProFeatures() {
  return Object.entries(PRO_FALLBACKS).map(([key, fb]) => ({
    key,
    description: fb.description,
    target_widget: fb.target_widget,
    can_render_static: fb.can_render_static,
    degrades_gracefully: fb.degrades_gracefully,
  }));
}

// ── Self-Test ──────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    if (process.argv.includes('--self-test')) {
      const tests = [
        { name: 'Loop Grid', widgetType: 'loop-grid' },
        { name: 'Form', widgetType: 'form' },
        { name: 'Nav Menu', widgetType: 'nav-menu' },
        { name: 'Popup', widgetType: 'popup' },
        { name: 'Heading', widgetType: 'e-heading' }, // non-Pro
        { name: 'Posts', widgetType: 'posts' },
      ];
      for (const t of tests) {
        const det = detectProFeature(t);
        if (det.isProFeature) {
          const r = maybeApplyProFallback(t, { isProActive: false });
          console.log(`PRO: ${t.name} → ${det.fallback.target_widget || 'NOTICE'} (applied=${r.applied})`);
        } else {
          console.log(`STD: ${t.name} → passthrough`);
        }
      }
    } else {
      console.log('Usage: node scripts/lib/pro-fallback.js --self-test');
      process.exit(1);
    }
  })();
}
