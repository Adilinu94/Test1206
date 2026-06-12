<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Ability Categories — registered once on `wp_abilities_api_categories_init`.
 *
 * 13 categories, one per ability sub-domain:
 *   - adrianv2-elementor         (Elementor core operations)
 *   - adrianv2-global-classes    (Global class management)
 *   - adrianv2-v4-management     (V4 migration + components + design system + interactions)
 *   - adrianv2-variables         (Global variables)
 *   - adrianv2-batch             (Batch content operations)
 *   - adrianv2-atomic            (Atomic widgets & layouts)
 *   - adrianv2-media             (Media library operations)
 *   - adrianv2-audit             (Visual & structural audits)
 *   - adrianv2-php-sandbox       (PHP snippet management)
 *   - adrianv2-custom-code       (Custom CSS/JS injection)
 *   - adrianv2-seo               (SEO toolkit)
 *   - adrianv2-a11y              (Accessibility toolkit)
 *   - adrianv2-utilities         (Misc utilities)
 *
 * @package Novamira_AdrianV2
 * @since   1.0.0
 */
add_action('wp_abilities_api_categories_init', static function (): void {
    $categories = [
        'novamira-adrianv2' => [
            'label'       => __('Novamira AdrianV2', 'novamira-adrianv2'),
            'description' => __('Umbrella category for all Novamira AdrianV2 abilities.', 'novamira-adrianv2'),
        ],
        'adrianv2-elementor' => [
            'label'       => __('AdrianV2 — Elementor', 'novamira-adrianv2'),
            'description' => __('Core Elementor operations: read/write pages, clone, duplicate, reorder, patch styles.', 'novamira-adrianv2'),
        ],
        'adrianv2-global-classes' => [
            'label'       => __('AdrianV2 — Global Classes', 'novamira-adrianv2'),
            'description' => __('Manage Elementor 4.0 global classes: add, remove, edit variants, apply variables.', 'novamira-adrianv2'),
        ],
        'adrianv2-v4-management' => [
            'label'       => __('AdrianV2 — V4 Management', 'novamira-adrianv2'),
            'description' => __('V4 migration (kit convert, foundation), component create/insert/detach, design system import/export, interactions.', 'novamira-adrianv2'),
        ],
        'adrianv2-variables' => [
            'label'       => __('AdrianV2 — Variables', 'novamira-adrianv2'),
            'description' => __('Create, update, delete Elementor v4 global variables in the kit.', 'novamira-adrianv2'),
        ],
        'adrianv2-batch' => [
            'label'       => __('AdrianV2 — Batch', 'novamira-adrianv2'),
            'description' => __('Batch read of multiple Elementor pages in one call.', 'novamira-adrianv2'),
        ],
        'adrianv2-atomic' => [
            'label'       => __('AdrianV2 — Atomic', 'novamira-adrianv2'),
            'description' => __('Elementor 4.0 atomic widgets, layouts (flexbox, div-block), and version detection.', 'novamira-adrianv2'),
        ],
        'adrianv2-media' => [
            'label'       => __('AdrianV2 — Media', 'novamira-adrianv2'),
            'description' => __('Media library: upload, list, edit, delete, batch upload, featured image, usage audit.', 'novamira-adrianv2'),
        ],
        'adrianv2-audit' => [
            'label'       => __('AdrianV2 — Audit', 'novamira-adrianv2'),
            'description' => __('Page, class, responsive, layout, visual-QA, and variable audits.', 'novamira-adrianv2'),
        ],
        'adrianv2-php-sandbox' => [
            'label'       => __('AdrianV2 — PHP Sandbox', 'novamira-adrianv2'),
            'description' => __('PHP snippet authoring: validate, create, update, get, list, delete (always drafts until admin activates).', 'novamira-adrianv2'),
        ],
        'adrianv2-custom-code' => [
            'label'       => __('AdrianV2 — Custom Code', 'novamira-adrianv2'),
            'description' => __('Custom CSS / JS injection at element, page, or site-wide level.', 'novamira-adrianv2'),
        ],
        'adrianv2-seo' => [
            'label'       => __('AdrianV2 — SEO', 'novamira-adrianv2'),
            'description' => __('SEO audit, keyword extraction, meta-tag generation, JSON-LD schema markup.', 'novamira-adrianv2'),
        ],
        'adrianv2-a11y' => [
            'label'       => __('AdrianV2 — A11Y', 'novamira-adrianv2'),
            'description' => __('WCAG accessibility audit, color-contrast fixer, alt-text auto-suggest.', 'novamira-adrianv2'),
        ],
        'adrianv2-utilities' => [
            'label'       => __('AdrianV2 — Utilities', 'novamira-adrianv2'),
            'description' => __('Misc utilities (smoke tests, hello-world probes).', 'novamira-adrianv2'),
        ],
    ];
    foreach ($categories as $slug => $args) {
        wp_register_ability_category($slug, $args);
    }
});
