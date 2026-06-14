<?php
/**
 * Novamira Ability: adrians-get-page
 *
 * Ability-Name:  novamira-adrianv2/adrians-get-page
 * Version:       1.0.0
 *
 * Gibt detaillierte Informationen zu einer WordPress-Seite zurück —
 * lookup per Post-ID, Slug oder URL. Gibt Elementor-Status, Template,
 * SEO-Plugin-Daten und verfügbare Widget-Typen zurück.
 *
 * Parameter:
 *   {
 *     "post_id":   int     optional - WordPress Post-ID
 *     "slug":      string  optional - Post-Slug (post_name)
 *     "url":       string  optional - Vollständige URL (wird zu Slug aufgelöst)
 *     "post_type": string  optional - "page"|"post"|"any" (default: "any")
 *   }
 *   Mindestens ein Lookup-Parameter erforderlich.
 *
 * Rückgabe:
 *   {
 *     "success": bool,
 *     "post_id": int, "title": string, "slug": string, "status": string,
 *     "post_type": string, "url": string, "modified": string,
 *     "template": string,
 *     "elementor": {
 *       "active": bool,
 *       "version": string|null,
 *       "widget_types": string[],
 *       "data_size_kb": float
 *     },
 *     "seo": { "plugin": string, "title": string|null, "description": string|null },
 *     "parent_id": int,
 *     "menu_order": int,
 *     "featured_image_id": int|null
 *   }
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/adrians-helpers.php';

function novamira_adrians_get_page( array $params ): array {

    if ( ! current_user_can( 'manage_options' ) ) {
        return [ 'success' => false, 'message' => 'Fehlende Berechtigung: manage_options erforderlich.' ];
    }

    // ── Lookup: ID, Slug oder URL ──────────────────────────────────────
    $post      = null;
    $post_type = sanitize_key( $params['post_type'] ?? 'any' );
    $types     = $post_type === 'any' ? [ 'page', 'post' ] : [ $post_type ];

    if ( ! empty( $params['post_id'] ) ) {
        $post = get_post( absint( $params['post_id'] ) );

    } elseif ( ! empty( $params['slug'] ) ) {
        $slug = sanitize_title( $params['slug'] );
        foreach ( $types as $type ) {
            $found = get_page_by_path( $slug, OBJECT, $type );
            if ( $found ) { $post = $found; break; }
        }

    } elseif ( ! empty( $params['url'] ) ) {
        $post_id = url_to_postid( esc_url_raw( $params['url'] ) );
        if ( $post_id ) {
            $post = get_post( $post_id );
        }
    }

    if ( ! $post ) {
        return [ 'success' => false, 'message' => 'Seite nicht gefunden. post_id, slug oder url angeben.' ];
    }

    // ── Elementor-Daten auswerten ─────────────────────────────────────
    $el_data_raw   = get_post_meta( $post->ID, '_elementor_data', true );
    $el_active     = ! empty( $el_data_raw );
    $el_version    = get_post_meta( $post->ID, '_elementor_version', true ) ?: null;
    $el_data_size  = $el_active ? round( strlen( $el_data_raw ) / 1024, 2 ) : 0;
    $el_types      = [];

    if ( $el_active ) {
        $decoded = json_decode( $el_data_raw, true );
        if ( is_array( $decoded ) ) {
            novamira_collect_widget_types( $decoded, $el_types );
        }
        $el_types = array_values( array_unique( $el_types ) );
    }

    // ── SEO-Plugin-Daten ───────────────────────────────────────────────
    $seo_title = $seo_desc = null;
    if ( defined( 'WPSEO_VERSION' ) || class_exists( 'WPSEO_Options' ) ) {
        $seo_plugin = 'yoast';
        $seo_title  = get_post_meta( $post->ID, '_yoast_wpseo_title',   true ) ?: null;
        $seo_desc   = get_post_meta( $post->ID, '_yoast_wpseo_metadesc', true ) ?: null;
    } elseif ( class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' ) ) {
        $seo_plugin = 'rank_math';
        $seo_title  = get_post_meta( $post->ID, 'rank_math_title',       true ) ?: null;
        $seo_desc   = get_post_meta( $post->ID, 'rank_math_description',  true ) ?: null;
    } else {
        $seo_plugin = 'none';
    }

    return [
        'success'           => true,
        'post_id'           => $post->ID,
        'title'             => $post->post_title,
        'slug'              => $post->post_name,
        'status'            => $post->post_status,
        'post_type'         => $post->post_type,
        'url'               => get_permalink( $post->ID ),
        'modified'          => $post->post_modified,
        'template'          => get_post_meta( $post->ID, '_wp_page_template', true ) ?: 'default',
        'elementor'         => [
            'active'        => $el_active,
            'version'       => $el_version,
            'widget_types'  => $el_types,
            'data_size_kb'  => $el_data_size,
        ],
        'seo'               => [
            'plugin'      => $seo_plugin,
            'title'       => $seo_title,
            'description' => $seo_desc,
        ],
        'parent_id'         => $post->post_parent,
        'menu_order'        => $post->menu_order,
        'featured_image_id' => get_post_thumbnail_id( $post->ID ) ?: null,
    ];
}

/**
 * Sammelt alle Widget-Typen rekursiv aus dem Elementor-Element-Tree.
 *
 * @param array    $elements Elementor-Element-Array
 * @param string[] &$types   Gesammelte Typen (per Referenz)
 */
function novamira_collect_widget_types( array $elements, array &$types ): void {
    foreach ( $elements as $el ) {
        if ( ! empty( $el['widgetType'] ) ) {
            $types[] = $el['widgetType'];
        } elseif ( ! empty( $el['type'] ) ) {
            $types[] = $el['type'];
        }
        if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
            novamira_collect_widget_types( $el['elements'], $types );
        }
    }
}
