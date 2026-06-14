<?php
/**
 * Novamira Ability: adrians-purge-cache
 *
 * Ability-Name:  novamira-adrianv2/adrians-purge-cache
 * Version:       1.0.0
 *
 * Löscht den Page-Cache nach einem Elementor-Build. Erkennt automatisch
 * welches Cache-Plugin aktiv ist (WP Rocket, LiteSpeed Cache, W3 Total Cache,
 * WP Super Cache, Autoptimize, Elementor CSS) und ruft die korrekte
 * Purge-API auf.
 *
 * Analog zum Plugin-Erkennungs-Pattern in adrians-generate-meta-tags.php.
 *
 * Parameter:
 *   {
 *     "post_id": int     optional - Post-ID für seiten-spezifischen Cache-Purge
 *                                   (null = Purge gesamter Site-Cache)
 *     "scope":   string  optional - "post" (default wenn post_id gesetzt) | "all"
 *     "include_elementor_css": bool optional - Elementor CSS-Cache löschen (default: true)
 *   }
 *
 * Rückgabe:
 *   {
 *     "success": bool,
 *     "post_id": int|null,
 *     "scope": "post"|"all",
 *     "plugins_found": string[],
 *     "plugins_purged": string[],
 *     "elementor_css_purged": bool,
 *     "message": string
 *   }
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/adrians-helpers.php';

function novamira_adrians_purge_cache( array $params ): array {

    if ( ! current_user_can( 'manage_options' ) ) {
        return [ 'success' => false, 'message' => 'Fehlende Berechtigung: manage_options erforderlich.' ];
    }

    $post_id              = ! empty( $params['post_id'] ) ? absint( $params['post_id'] ) : null;
    $scope                = ( $post_id && ( $params['scope'] ?? 'post' ) !== 'all' ) ? 'post' : 'all';
    $include_el_css       = isset( $params['include_elementor_css'] )
                            ? (bool) $params['include_elementor_css'] : true;

    // Post validieren wenn post_id angegeben
    if ( $post_id && ! get_post( $post_id ) ) {
        return [ 'success' => false, 'message' => "Post $post_id nicht gefunden." ];
    }

    $plugins_found  = [];
    $plugins_purged = [];

    // ── WP Rocket ─────────────────────────────────────────────────────
    if ( function_exists( 'rocket_clean_post' ) || function_exists( 'rocket_clean_domain' ) ) {
        $plugins_found[] = 'wp_rocket';
        if ( $scope === 'post' && $post_id && function_exists( 'rocket_clean_post' ) ) {
            rocket_clean_post( $post_id );
        } elseif ( function_exists( 'rocket_clean_domain' ) ) {
            rocket_clean_domain();
        }
        $plugins_purged[] = 'wp_rocket';
    }

    // ── LiteSpeed Cache ────────────────────────────────────────────────
    if ( class_exists( 'LiteSpeed_Cache_API' ) || has_action( 'litespeed_purge_post' ) ) {
        $plugins_found[] = 'litespeed';
        if ( $scope === 'post' && $post_id ) {
            do_action( 'litespeed_purge_post', $post_id );
        } else {
            do_action( 'litespeed_purge_all' );
        }
        $plugins_purged[] = 'litespeed';
    }

    // ── W3 Total Cache ─────────────────────────────────────────────────
    if ( function_exists( 'w3tc_flush_post' ) || function_exists( 'w3tc_flush_all' ) ) {
        $plugins_found[] = 'w3tc';
        if ( $scope === 'post' && $post_id && function_exists( 'w3tc_flush_post' ) ) {
            w3tc_flush_post( $post_id );
        } elseif ( function_exists( 'w3tc_flush_all' ) ) {
            w3tc_flush_all();
        }
        $plugins_purged[] = 'w3tc';
    }

    // ── WP Super Cache ─────────────────────────────────────────────────
    if ( function_exists( 'wpsc_delete_post_cache' ) || function_exists( 'wp_cache_clear_cache' ) ) {
        $plugins_found[] = 'wp_super_cache';
        if ( $scope === 'post' && $post_id && function_exists( 'wpsc_delete_post_cache' ) ) {
            wpsc_delete_post_cache( $post_id );
        } elseif ( function_exists( 'wp_cache_clear_cache' ) ) {
            wp_cache_clear_cache();
        }
        $plugins_purged[] = 'wp_super_cache';
    }

    // ── Autoptimize ────────────────────────────────────────────────────
    if ( class_exists( 'autoptimizeCache' ) ) {
        $plugins_found[]  = 'autoptimize';
        autoptimizeCache::clearall();
        $plugins_purged[] = 'autoptimize';
    }

    // ── SG Optimizer (SiteGround) ─────────────────────────────────────
    if ( function_exists( 'sg_cachepress_purge_cache' ) ) {
        $plugins_found[]  = 'sg_optimizer';
        sg_cachepress_purge_cache();
        $plugins_purged[] = 'sg_optimizer';
    }

    // ── Elementor CSS-Cache ────────────────────────────────────────────
    $el_css_purged = false;
    if ( $include_el_css && class_exists( '\Elementor\Plugin' ) ) {
        if ( $scope === 'post' && $post_id ) {
            \Elementor\Plugin::$instance->files_manager->clear_cache();
        } else {
            \Elementor\Plugin::$instance->files_manager->clear_cache();
        }
        $el_css_purged = true;
    }

    // ── Wenn gar kein Cache-Plugin gefunden: WP-Core transient flush ──
    if ( empty( $plugins_found ) ) {
        // Minimal-Fallback: WP object cache leeren
        wp_cache_flush();
        $plugins_purged[] = 'wp_object_cache';
    }

    $scope_label = $scope === 'post' && $post_id ? "Post $post_id" : 'Site-weit';

    return [
        'success'             => true,
        'post_id'             => $post_id,
        'scope'               => $scope,
        'plugins_found'       => $plugins_found,
        'plugins_purged'      => $plugins_purged,
        'elementor_css_purged'=> $el_css_purged,
        'message'             => empty( $plugins_purged )
            ? 'Kein Cache-Plugin gefunden. wp_object_cache geleert.'
            : "$scope_label Cache geleert via: " . implode( ', ', $plugins_purged ),
    ];
}
