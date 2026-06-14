<?php
/**
 * Novamira Ability: adrians-export-gc-snapshot
 *
 * Ability-Name:  novamira-adrianv2/adrians-export-gc-snapshot
 * Version:       1.0.0
 *
 * Serialisiert alle Elementor Global Classes (GC) und Global Variables (GV)
 * in ein portables JSON-Snapshot-Format. Kann via adrians-restore-gc-snapshot
 * wiederhergestellt werden.
 *
 * Rollback-Ergänzung: rollback.js sichert Page-Content —
 * dieser Snapshot sichert das Design-System (GCs + GVs) separat.
 *
 * Parameter:
 *   {
 *     "include_classes":   bool  optional - Global Classes einschließen (default: true)
 *     "include_variables": bool  optional - Global Variables einschließen (default: true)
 *   }
 *
 * Rückgabe:
 *   {
 *     "success": bool,
 *     "snapshot_version": "1.0",
 *     "timestamp": string,
 *     "wp_site_url": string,
 *     "counts": { "global_classes": int, "global_variables": int },
 *     "global_classes": [...],
 *     "global_variables": [...]
 *   }
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/adrians-helpers.php';

function novamira_adrians_export_gc_snapshot( array $params ): array {

    if ( ! current_user_can( 'manage_options' ) ) {
        return [ 'success' => false, 'message' => 'Fehlende Berechtigung: manage_options erforderlich.' ];
    }

    $include_classes   = isset( $params['include_classes'] )   ? (bool) $params['include_classes']   : true;
    $include_variables = isset( $params['include_variables'] ) ? (bool) $params['include_variables'] : true;

    $global_classes   = [];
    $global_variables = [];

    // ── Global Classes exportieren ─────────────────────────────────────
    if ( $include_classes ) {
        // Elementor V4: GCs sind in der Options-Tabelle als JSON gespeichert
        $gc_option = get_option( 'elementor_global_classes', null );

        if ( is_string( $gc_option ) ) {
            // Gespeichert als JSON-String
            $gc_data = json_decode( $gc_option, true );
            if ( is_array( $gc_data ) ) {
                $global_classes = $gc_data;
            }
        } elseif ( is_array( $gc_option ) ) {
            $global_classes = $gc_option;
        }

        // Fallback: Post-Type (ältere Elementor-Versionen)
        if ( empty( $global_classes ) && post_type_exists( 'e_global_class' ) ) {
            $gc_posts = get_posts( [
                'post_type'      => 'e_global_class',
                'post_status'    => 'publish',
                'posts_per_page' => -1,
            ] );
            foreach ( $gc_posts as $gc_post ) {
                $global_classes[] = [
                    'id'    => 'gc-' . $gc_post->post_name,
                    'label' => $gc_post->post_title,
                    'props' => json_decode( $gc_post->post_content, true ) ?: [],
                ];
            }
        }
    }

    // ── Global Variables exportieren ───────────────────────────────────
    if ( $include_variables ) {
        // Elementor V4: GVs in Options-Tabelle
        $gv_option = get_option( 'elementor_global_variables', null );

        if ( is_string( $gv_option ) ) {
            $gv_data = json_decode( $gv_option, true );
            if ( is_array( $gv_data ) ) {
                $global_variables = $gv_data;
            }
        } elseif ( is_array( $gv_option ) ) {
            $global_variables = $gv_option;
        }

        // Fallback: Kit-Einstellungen (Elementor-Kit Post Meta)
        if ( empty( $global_variables ) ) {
            $kit_id = get_option( 'elementor_active_kit' );
            if ( $kit_id ) {
                $kit_meta = get_post_meta( $kit_id, '_elementor_page_settings', true );
                if ( $kit_meta ) {
                    $kit_settings = is_string( $kit_meta ) ? json_decode( $kit_meta, true ) : $kit_meta;
                    if ( ! empty( $kit_settings['__globals__'] ) ) {
                        $global_variables = $kit_settings['__globals__'];
                    }
                }
            }
        }
    }

    return [
        'success'          => true,
        'snapshot_version' => '1.0',
        'timestamp'        => current_time( 'c' ),
        'wp_site_url'      => get_site_url(),
        'counts'           => [
            'global_classes'   => count( $global_classes ),
            'global_variables' => count( $global_variables ),
        ],
        'global_classes'   => $global_classes,
        'global_variables' => $global_variables,
    ];
}
