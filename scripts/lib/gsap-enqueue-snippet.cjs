/**
 * scripts/lib/gsap-enqueue-snippet.cjs
 *
 * Reusable GSAP Global Enqueue PHP snippet definition.
 * Immer als ERSTES Snippet in jeden Animation-Plan einfügen.
 * on_conflict: "skip" verhindert Duplikate bei wiederholten Builds.
 *
 * Usage (Node.js CJS):
 *   const GSAP_ENQUEUE = require('./scripts/lib/gsap-enqueue-snippet.cjs');
 *   snippets.unshift(GSAP_ENQUEUE);
 */

const GSAP_VERSION = '3.12.5';

const GSAP_ENQUEUE_SNIPPET = {
  title: 'GSAP Global Enqueue',
  type: 'php',
  code: `function enqueue_gsap_global() {
    wp_enqueue_script('gsap-core', 'https://cdn.jsdelivr.net/npm/gsap@${GSAP_VERSION}/dist/gsap.min.js', [], '${GSAP_VERSION}', true);
    wp_enqueue_script('gsap-st', 'https://cdn.jsdelivr.net/npm/gsap@${GSAP_VERSION}/dist/ScrollTrigger.min.js', ['gsap-core'], '${GSAP_VERSION}', true);
}
add_action('wp_enqueue_scripts', 'enqueue_gsap_global');`,
  location: 'site_wide_header',
  priority: 10,
  on_conflict: 'skip',
  description: `GSAP Core ${GSAP_VERSION} + ScrollTrigger via CDN global enqueue. Einmalig pro Site. Priority 10 sorgt für Laden vor allen Animations-Snippets.`,
  tags: ['gsap', 'enqueue', 'global', 'critical'],
};

module.exports = GSAP_ENQUEUE_SNIPPET;
