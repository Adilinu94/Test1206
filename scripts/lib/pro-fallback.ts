/**
 * scripts/lib/pro-fallback.ts  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 4.3 — Pro-Feature-Generics.
 */

export interface ProFallbackEntry {
  description: string;
  target_widget: string | null;
  children_pattern: string;
  notice?: string;
  can_render_static: boolean;
  degrades_gracefully: boolean;
}

export interface ComponentInput {
  name?: string;
  widgetType?: string;
  attrs?: Record<string, unknown>;
  _detected_key?: string;
}

export interface DetectionResult {
  isProFeature: boolean;
  fallback: ProFallbackEntry | null;
  originalName: string;
  key?: string;
}

export interface ApplyResult {
  applied: boolean;
  element: Record<string, unknown> | null;
  detection: DetectionResult;
  reason?: string;
}

const PRO_FALLBACKS: Record<string, ProFallbackEntry> = {
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

export function detectProFeature(component: ComponentInput): DetectionResult {
  if (!component || typeof component !== 'object') {
    return { isProFeature: false, fallback: null, originalName: '' };
  }
  const name = (component.name || component.widgetType || '').toLowerCase().trim();
  const normalized = name.replace(/[\s_-]+/g, '-');

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

export function applyProFallback(originalComponent: ComponentInput, fallback: ProFallbackEntry): Record<string, unknown> | null {
  if (!fallback) return null;

  if (fallback.target_widget === null) {
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
        classes: { $$type: 'classes', value: [] },
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

export function maybeApplyProFallback(component: ComponentInput, { isProActive = false }: { isProActive?: boolean } = {}): ApplyResult {
  const detection = detectProFeature(component);
  if (!detection.isProFeature) return { applied: false, element: null, detection };
  if (isProActive) return { applied: false, element: null, detection, reason: 'pro-active' };

  const element = applyProFallback({ ...component, _detected_key: detection.key }, detection.fallback!);
  return { applied: true, element, detection };
}

export function listProFeatures(): Array<{ key: string; description: string; target_widget: string | null; can_render_static: boolean; degrades_gracefully: boolean }> {
  return Object.entries(PRO_FALLBACKS).map(([key, fb]) => ({
    key,
    description: fb.description,
    target_widget: fb.target_widget,
    can_render_static: fb.can_render_static,
    degrades_gracefully: fb.degrades_gracefully,
  }));
}
