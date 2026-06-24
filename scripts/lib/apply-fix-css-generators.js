/**
 * scripts/lib/apply-fix-css-generators.js
 *
 * Pure CSS generation functions extracted from apply-design-diff-fixes.js.
 * Each function takes a design-diff category entry and returns an array of
 * CSS rule strings (one per line, indented for insertion in a selector block).
 *
 * All functions are synchronous, pure, and have no side effects.
 * Ideal for unit testing with mock diff data.
 *
 * @module apply-fix-css-generators
 */

/**
 * Generates CSS for a color diff entry.
 * Strategies:
 *  - Inject missing Framer colors as CSS custom properties
 *  - Override text colors if match_pct < 40
 *  - Override background if match_pct < 50
 *
 * @param {object} diff - Color category from design-diff report
 * @param {object} diff.text_colors - { only_in_framer, match_pct }
 * @param {object} diff.background_colors - { only_in_framer, match_pct }
 * @returns {string[]} CSS lines (with 2-space indent)
 */
export function generateColorFixes(diff) {
  diff = diff || {};
  const lines = [];
  const textColors = diff.text_colors || {};
  const bgColors = diff.background_colors || {};

  // Text color variables for missing Framer colors
  const missingText = textColors.only_in_framer || [];
  if (missingText.length > 0) {
    lines.push(`  /* Missing Framer text colors (${missingText.length}) */`);
    missingText.forEach((color, i) => {
      lines.push(`  --framer-missing-text-${i + 1}: ${color};`);
    });
  }

  // Background color variables
  const missingBg = bgColors.only_in_framer || [];
  if (missingBg.length > 0) {
    lines.push(`  /* Missing Framer background colors (${missingBg.length}) */`);
    missingBg.forEach((color, i) => {
      lines.push(`  --framer-missing-bg-${i + 1}: ${color};`);
    });
  }

  // If text color match is very low, suggest overriding heading/body colors
  if (textColors.match_pct !== undefined && textColors.match_pct < 40) {
    lines.push(`  /* ⚠ WARNING: Low text color match (${textColors.match_pct}%). */`);
    lines.push(`  /* Overriding ALL text colors on this selector. Review manually or use --min-severity PASS to skip. */`);
    if (missingText[0]) {
      lines.push(`  color: ${missingText[0]};`);
    }
  }

  // If background color match is low
  if (bgColors.match_pct !== undefined && bgColors.match_pct < 50) {
    lines.push(`  /* Low background color match (${bgColors.match_pct}%). */`);
    if (missingBg[0]) {
      lines.push(`  background-color: ${missingBg[0]};`);
    }
  }

  return lines;
}

/**
 * Generates CSS for typography diffs.
 * Strategies:
 *  - Font-size correction based on diff_pct
 *  - Font-weight injection for missing weights
 *  - Line-height override
 *  - Font-family import suggestion (via @import comment)
 *
 * @param {object} diff - Typography category from design-diff report
 * @returns {string[]} CSS lines
 */
export function generateTypographyFixes(diff) {
  diff = diff || {};
  const lines = [];
  const fonts = diff.fonts || {};
  const fontSize = diff.font_size || {};
  const fontWeight = diff.font_weight || {};
  const lineHeight = diff.line_height || {};

  // Missing font families → suggest @import
  const missingFonts = fonts.only_in_framer || [];
  if (missingFonts.length > 0) {
    lines.push(`  /* Missing font families. Add to your Google Fonts import: */`);
    const googleFontNames = missingFonts.map(f => f.replace(/\s+/g, '+')).join('&family=');
    lines.push(`  /* @import url('https://fonts.googleapis.com/css2?family=${googleFontNames}&display=swap'); */`);
    lines.push(`  font-family: ${missingFonts.map(f => `'${f}'`).join(', ')}, sans-serif;`);
  }

  // Font-size correction
  if (fontSize.diff_pct !== undefined && fontSize.diff_pct > 10) {
    const framerSize = fontSize.framer_median || 16;
    const elSize = fontSize.elementor_median || 16;
    if (framerSize && elSize && framerSize !== elSize) {
      const ratio = framerSize / elSize;
      if (isNaN(ratio) || ratio > 1.3 || ratio < 0.7) {
        // Big difference or NaN — set absolute
        lines.push(`  /* Font-size diff ${fontSize.diff_pct}%: ${elSize}px → ${framerSize}px */`);
        lines.push(`  font-size: ${framerSize}px;`);
      } else {
        // Small difference — use scale for relative adjustment
        const pct = Math.round(ratio * 100);
        lines.push(`  /* Font-size diff ${fontSize.diff_pct}%: scaling by ${pct}% */`);
        lines.push(`  font-size: calc(1em * ${ratio.toFixed(2)});`);
      }
    }
  }

  // Font-weight injection
  const missingWeights = fontWeight.missing_in_elementor || [];
  if (missingWeights.length > 0) {
    lines.push(`  /* Missing font-weights: ${missingWeights.join(', ')} */`);
    missingWeights.forEach(w => {
      lines.push(`  /* To apply weight ${w}, add class or target element: font-weight: ${w}; */`);
    });
  }

  // Line-height override
  if (lineHeight.diff_pct !== undefined && lineHeight.diff_pct > 15) {
    const framerLh = lineHeight.framer_median;
    const elLh = lineHeight.elementor_median;
    if (framerLh && elLh) {
      lines.push(`  /* Line-height diff ${lineHeight.diff_pct}%: ${elLh}px → ${framerLh}px */`);
      lines.push(`  line-height: ${framerLh}px;`);
    }
  }

  return lines;
}

/**
 * Generates CSS for spacing diffs.
 *
 * @param {object} diff - Spacing category from design-diff report
 * @returns {string[]} CSS lines
 */
export function generateSpacingFixes(diff) {
  diff = diff || {};
  const lines = [];
  const padding = diff.padding || {};
  const margin = diff.margin || {};

  if (padding.diff_pct !== undefined && padding.diff_pct > 10) {
    if (padding.framer_median != null) {
      lines.push(`  /* Padding diff ${padding.diff_pct}%: override to Framer median */`);
      lines.push(`  padding: ${padding.framer_median}px;`);
    }
  }

  if (margin.diff_pct !== undefined && margin.diff_pct > 20) {
    if (margin.framer_median != null) {
      lines.push(`  /* Margin diff ${margin.diff_pct}%: override to Framer median */`);
      lines.push(`  margin: ${margin.framer_median}px;`);
    } else if (margin.elementor_median != null && margin.elementor_median > 0) {
      // Framer has no margin, Elementor added one → remove it
      lines.push(`  /* Margin diff ${margin.diff_pct}%: Elementor added margin where Framer has none */`);
      lines.push(`  margin: 0;`);
    }
  }

  return lines;
}

/**
 * Generates CSS for layout diffs.
 *
 * @param {object} diff - Layout category from design-diff report
 * @returns {string[]} CSS lines
 */
export function generateLayoutFixes(diff) {
  diff = diff || {};
  const lines = [];
  const container = diff.container || {};

  if (container.width_diff_pct !== undefined && container.width_diff_pct > 5) {
    if (container.framer_width != null) {
      lines.push(`  /* Container width diff ${container.width_diff_pct}% */`);
      lines.push(`  width: ${container.framer_width}px;`);
    }
  }

  if (container.max_width_diff_pct !== undefined && container.max_width_diff_pct > 5) {
    if (container.framer_max_width != null) {
      lines.push(`  /* Max-width diff ${container.max_width_diff_pct}% */`);
      lines.push(`  max-width: ${container.framer_max_width}px;`);
    } else if (container.elementor_max_width == null && container.framer_width != null) {
      // Both null → set an explicit max-width
      lines.push(`  /* Set explicit max-width (both null in source) */`);
      lines.push(`  max-width: ${container.framer_width}px;`);
    }
  }

  return lines;
}

/**
 * Generates CSS for visual diffs.
 *
 * @param {object} diff - Visual category from design-diff report
 * @returns {string[]} CSS lines
 */
export function generateVisualFixes(diff) {
  diff = diff || {};
  const lines = [];
  const borderColors = diff.border_colors || {};
  const borderRadius = diff.border_radius || {};
  const shadows = diff.shadows || {};

  // Missing border colors as CSS variables
  const missingBorders = borderColors.only_in_framer || [];
  if (missingBorders.length > 0) {
    lines.push(`  /* Missing Framer border colors (${missingBorders.length}) */`);
    missingBorders.forEach((color, i) => {
      lines.push(`  --framer-missing-border-${i + 1}: ${color};`);
    });
  }

  // Border-radius override
  if (borderRadius.diff_pct !== undefined && borderRadius.diff_pct > 20) {
    if (borderRadius.framer_median != null) {
      lines.push(`  /* Border-radius diff ${borderRadius.diff_pct}%: ${borderRadius.elementor_median || '?'}px → ${borderRadius.framer_median}px */`);
      lines.push(`  border-radius: ${borderRadius.framer_median}px;`);
    }
  }

  // Box-shadow
  if (shadows.framer_count !== undefined && shadows.elementor_count !== undefined) {
    if (shadows.framer_count === 0 && shadows.elementor_count > 0) {
      lines.push(`  /* Elementor has box-shadow, Framer has none */`);
      lines.push(`  box-shadow: none;`);
    }
  }

  return lines;
}
