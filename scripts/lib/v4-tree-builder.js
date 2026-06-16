/**
 * scripts/lib/v4-tree-builder.js
 * UMBAUPLAN v2.0 Phase 1.1 + 1.4 — Atomic-Tree-Builder Helpers.
 *
 * Kapselt die V4-Atomic-Tree-Konstruktion in 3 Pure-Functions:
 *   - buildAtomicContainer() — e-flexbox / e-div-block (elType = widgetType)
 *   - buildAtomicWidget()    — e-heading / e-paragraph / e-button / e-image etc.
 *   - buildStyleClass()      — Style-Variants-Objekt mit class-id-Struktur
 *
 * Bricht Invarianten I-V niemals:
 *   I   style.id MUSS in settings.classes.value enthalten sein
 *   II  Visuelle Props (color, padding…) NUR in styles, nie in settings
 *   III style-IDs nur [a-z][a-z0-9_]*
 *   IV  image-src.id gesetzt → kein url-Key
 *   V   custom_css immer {raw: '...'} oder null
 *
 * Alle Funktionen sind pure (keine side-effects, kein I/O) — ideal für Tests.
 */

import {
  wrapType, wrapColor, wrapSize, wrapDimensions, wrapBorderRadius,
  wrapClasses, wrapImage, wrapImageSrc, wrapHtmlContent,
  sanitizeStyleId, isValidStyleId, generateStyleId,
} from './framer-utils.js';

const ATOMIC_ELEMENT_TYPES = new Set(['e-flexbox', 'e-div-block']);

/**
 * Baut ein V4-Atomic-Container-Element (e-flexbox / e-div-block).
 *
 * @param {object} opts
 * @param {string} opts.id       - Widget-ID (bereits sanitized)
 * @param {string} opts.tag      - HTML-Tag ('div' | 'section' | ...)
 * @param {string} opts.styleId  - Style-Class-ID (bereits sanitized)
 * @param {string} [opts.widgetType='e-flexbox'] - 'e-flexbox' | 'e-div-block'
 * @param {string} [opts.label]  - Class-Label (default: widgetType)
 * @param {Array}  [opts.children=[]]
 * @returns {object} V4-Element
 */
export function buildAtomicContainer({
  id, tag, styleId, widgetType = 'e-flexbox', label, children = [],
}) {
  if (!isValidStyleId(styleId)) {
    throw new Error(`buildAtomicContainer: invalid styleId "${styleId}" (Invariant III)`);
  }
  const node = {
    type: widgetType,
    elType: widgetType, // Atomic-Container: elType === widgetType
    widgetType,
    id,
    settings: {
      classes: wrapClasses([styleId]),
      tag: wrapType('string', tag || 'div'),
    },
    styles: {
      [styleId]: buildStyleClass({ id: styleId, label: label || widgetType }),
    },
  };
  if (children.length > 0) node.elements = children;
  return node;
}

/**
 * Baut ein V4-Atomic-Widget (e-heading / e-paragraph / e-button / e-image / e-svg / e-component / e-divider).
 *
 * @param {object} opts
 * @param {string} opts.id
 * @param {string} opts.widgetType  - 'e-heading' | 'e-paragraph' | 'e-button' | 'e-image' | ...
 * @param {string} opts.styleId
 * @param {object} [opts.settings={}] - Widget-spezifische Settings (text, link, image, etc.)
 * @param {string} [opts.label]
 * @returns {object} V4-Element
 */
export function buildAtomicWidget({
  id, widgetType, styleId, settings = {}, label,
}) {
  if (!isValidStyleId(styleId)) {
    throw new Error(`buildAtomicWidget: invalid styleId "${styleId}" (Invariant III)`);
  }
  if (ATOMIC_ELEMENT_TYPES.has(widgetType)) {
    throw new Error(`buildAtomicWidget: widgetType "${widgetType}" is a container — use buildAtomicContainer()`);
  }
  // Invariant IV: image-src mit id → kein url-Key
  const finalSettings = { classes: wrapClasses([styleId]), ...settings };
  return {
    type: widgetType,
    elType: 'widget',
    widgetType,
    id,
    settings: finalSettings,
    styles: {
      [styleId]: buildStyleClass({ id: styleId, label: label || widgetType }),
    },
  };
}

/**
 * Baut ein V4-Style-Class-Objekt (class-id-Struktur).
 *
 * @param {object} opts
 * @param {string} opts.id            - Style-Class-ID
 * @param {string} [opts.label]       - Class-Label
 * @param {string} [opts.type='class']
 * @param {Array}  [opts.variants]    - Array von {meta, props, custom_css}; default = empty desktop
 * @returns {object} V4-Style-Class
 */
export function buildStyleClass({
  id, label, type = 'class', variants,
}) {
  if (!isValidStyleId(id)) {
    throw new Error(`buildStyleClass: invalid id "${id}" (Invariant III)`);
  }
  const finalVariants = variants && variants.length > 0
    ? variants
    : [{
        meta: { breakpoint: null, state: null },
        props: {},
        custom_css: null, // Invariant V
      }];
  return {
    id,
    label: label || id,
    type,
    variants: finalVariants,
  };
}

/**
 * UMBAUPLAN v2.0 Phase 1.4 — Framer-Style-Property → V4-Prop Mapping.
 * Maps CSS-Properties aus Framer-Attrs auf V4-Wrapped-Props.
 *
 * @param {object} attrs - Framer-XML-Node-Attribute
 * @param {string} widgetType
 * @param {object} [opts] - { tokenMapping, fontResolution, imageMap }
 * @returns {object} V4-Props (key → wrapped value)
 */
export function mapFramerStyleToV4Props(attrs, widgetType, opts = {}) {
  const {
    stackDirection, stackGap, padding, maxWidth, width, height,
    backgroundColor, 'background-color': bgColor,
    borderRadius, 'border-radius': borderRadiusAlt,
    position, top, right, bottom, left,
    color, 'font-family': fontFamily, 'font-size': fontSize,
    'font-weight': fontWeight, 'line-height': lineHeight,
    'letter-spacing': letterSpacing, opacity,
  } = attrs;
  const props = {};

  // Layout
  if (widgetType === 'e-flexbox' || widgetType === 'e-button') {
    props['display'] = wrapType('string', 'flex');
    if (stackDirection) {
      props['flex-direction'] = wrapType('string', stackDirection === 'vertical' ? 'column' : 'row');
    }
    if (stackGap) props['gap'] = wrapSize(stackGap);
    if (padding) props['padding'] = wrapDimensions(padding);
    if (maxWidth && /^[-0-9.]/.test(maxWidth)) props['max-width'] = wrapSize(maxWidth);
  }

  if (widgetType === 'e-div-block') {
    props['display'] = wrapType('string', 'grid');
  }

  // Typography
  if (widgetType === 'e-heading' || widgetType === 'e-paragraph') {
    if (fontSize)      props['font-size']    = wrapSize(fontSize);
    if (fontWeight)    props['font-weight']  = wrapType('string', fontWeight);
    if (fontFamily)    props['font-family']  = wrapType('string', fontFamily.split(',')[0].trim().replace(/['"]/g, ''));
    if (color) {
      const hex = String(color).trim();
      if (hex.startsWith('#')) props['color'] = wrapColor(hex);
    }
  }

  // Border radius
  const br = borderRadius || borderRadiusAlt;
  if (br) props['border-radius'] = wrapBorderRadius(br);

  // Positioning
  if (position) {
    const hasExplicitOffsets = top !== undefined || right !== undefined || bottom !== undefined || left !== undefined;
    if (position !== 'absolute' || hasExplicitOffsets) {
      props['position'] = wrapType('string', position);
    }
  }

  // Opacity
  if (opacity !== undefined) props['opacity'] = wrapType('string', String(opacity));

  return props;
}

/**
 * UMBAUPLAN v2.0 Phase 1.4 — Convenience für den Standard-Variant.
 * Vereint mapFramerStyleToV4Props + buildStyleClass.
 *
 * @returns {object} V4-Variant {meta, props, custom_css}
 */
export function buildDesktopVariant(attrs, widgetType, opts) {
  return {
    meta: { breakpoint: null, state: null },
    props: mapFramerStyleToV4Props(attrs, widgetType, opts),
    custom_css: null, // Invariant V
  };
}

/**
 * UMBAUPLAN v2.0 Phase 1.3 — Convenience für `wrapClasses` (re-export).
 */
export { wrapClasses } from './framer-utils.js';
