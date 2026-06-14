<?php
/**
 * Novamira Ability: adrians-create-test-page
 *
 * Ability-Name:  novamira-adrianv2/adrians-create-test-page
 * Version:       1.0.0
 *
 * Erstellt eine Draft-Testseite für Pipeline-Integration-Tests auf solar.local.
 * Die erstellte Seite wird mit einem Metafeld markiert damit sie automatisch
 * via adrians-cleanup-test-pages aufgeräumt werden kann.
 *
 * Parameter:
 *   {
 *     "title":         string  optional - Seitentitel (default: "Pipeline Test Page — {timestamp}")
 *     "status":        string  optional - "draft" | "publish" (default: "draft")
 *     "template":      string  optional - WP-Template (default: "elementor_canvas")
 *     "meta":          object  optional - Zusätzliche Post-Meta-Felder
 *   }
 *
 * Rückgabe:
 *   {
 *     "success": bool, "post_id": int, "title": string,
 *     "status": string, "url": string, "edit_url": string,
 *     "test_marker": string, "message": string
 *   }
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/adrians-helpers.php';

function novamira_adrians_create_test_page( array $params ): array {

    if ( ! current_user_can( 'manage_options' ) ) {
        return [ 'success' => false, 'message' => 'Fehlende Berechtigung: manage_options erforderlich.' ];
    }

    $timestamp = current_time( 'Y-m-d H:i:s' );
    $title     = sanitize_text_field( $params['title'] ?? "Pipeline Test Page — {$timestamp}" );
    $status    = in_array( $params['status'] ?? 'draft', [ 'draft', 'publish', 'private' ], true )
                    ? $params['status'] : 'draft';
    $template  = sanitize_text_field( $params['template'] ?? 'elementor_canvas' );
    $extra_meta = is_array( $params['meta'] ?? null ) ? $params['meta'] : [];

    // Seite erstellen
    $post_id = wp_insert_post( [
        'post_title'   => $title,
        'post_status'  => $status,
        'post_type'    => 'page',
        'post_content' => '',
    ] );

    if ( is_wp_error( $post_id ) ) {
        return [
            'success' => false,
            'message' => 'Seite konnte nicht erstellt werden: ' . $post_id->get_error_message(),
        ];
    }

    // Test-Marker setzen (für automatisches Aufräumen)
    $test_marker = 'novamira-pipeline-test-' . current_time( 'U' );
    update_post_meta( $post_id, '_novamira_test_page',    $test_marker );
    update_post_meta( $post_id, '_novamira_test_created', current_time( 'c' ) );
    update_post_meta( $post_id, '_wp_page_template',       $template );

    // Elementor als Builder markieren (leere Daten)
    update_post_meta( $post_id, '_elementor_edit_mode', 'builder' );
    update_post_meta( $post_id, '_elementor_data',      '[]' );
    update_post_meta( $post_id, '_elementor_version',   defined( 'ELEMENTOR_VERSION' ) ? ELEMENTOR_VERSION : '0.0' );

    // Zusätzliche Meta-Felder
    foreach ( $extra_meta as $key => $value ) {
        update_post_meta( $post_id, sanitize_key( $key ), $value );
    }

    return [
        'success'     => true,
        'post_id'     => $post_id,
        'title'       => $title,
        'status'      => $status,
        'url'         => get_permalink( $post_id ),
        'edit_url'    => get_edit_post_link( $post_id, 'raw' ),
        'test_marker' => $test_marker,
        'message'     => "Testseite \"$title\" (ID: $post_id) als $status erstellt. Marker: $test_marker",
    ];
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Novamira Ability: adrians-cleanup-test-pages
 *
 * Ability-Name:  novamira-adrianv2/adrians-cleanup-test-pages
 * Version:       1.0.0
 *
 * Löscht alle Testseiten die von adrians-create-test-page erstellt wurden.
 * Filter: Seiten mit _novamira_test_page Meta, älter als min_age_minutes.
 *
 * SICHERHEIT: dry_run ist per Default true.
 *
 * Parameter:
 *   {
 *     "min_age_minutes": int   optional - Nur Seiten löschen die älter als N Minuten (default: 5)
 *     "dry_run":         bool  optional - Nur simulieren (default: true)
 *     "test_marker":     string optional - Spezifischen Marker löschen (null = alle Testseiten)
 *   }
 *
 * Rückgabe:
 *   {
 *     "success": bool, "dry_run": bool,
 *     "found": int, "deleted": int,
 *     "pages": [{ "post_id": int, "title": string, "created": string }],
 *     "message": string
 *   }
 */
function novamira_adrians_cleanup_test_pages( array $params ): array {

    if ( ! current_user_can( 'manage_options' ) ) {
        return [ 'success' => false, 'message' => 'Fehlende Berechtigung: manage_options erforderlich.' ];
    }

    $min_age   = absint( $params['min_age_minutes'] ?? 5 );
    $dry_run   = isset( $params['dry_run'] ) ? (bool) $params['dry_run'] : true;
    $marker    = sanitize_text_field( $params['test_marker'] ?? '' );

    // Test-Seiten suchen
    $query_args = [
        'post_type'      => 'page',
        'post_status'    => [ 'publish', 'draft', 'private', 'trash' ],
        'posts_per_page' => -1,
        'meta_query'     => [ [
            'key'     => '_novamira_test_page',
            'compare' => 'EXISTS',
        ] ],
    ];

    if ( $marker ) {
        $query_args['meta_query'][] = [
            'key'   => '_novamira_test_page',
            'value' => $marker,
        ];
        $query_args['meta_query']['relation'] = 'AND';
    }

    $q = new WP_Query( $query_args );
    $pages_info = [];
    $deleted    = 0;
    $cutoff     = time() - ( $min_age * 60 );

    foreach ( $q->posts as $post ) {
        $created_ts  = get_post_meta( $post->ID, '_novamira_test_created', true );
        $created_unix = $created_ts ? strtotime( $created_ts ) : strtotime( $post->post_date );

        // Mindestalter prüfen
        if ( $created_unix > $cutoff ) {
            continue; // Zu jung — überspringen
        }

        $pages_info[] = [
            'post_id' => $post->ID,
            'title'   => $post->post_title,
            'created' => $created_ts ?: $post->post_date,
            'marker'  => get_post_meta( $post->ID, '_novamira_test_page', true ),
        ];

        if ( ! $dry_run ) {
            wp_delete_post( $post->ID, true ); // true = permanent delete, kein Papierkorb
            $deleted++;
        } else {
            $deleted++; // In dry_run: würde gelöscht werden
        }
    }

    $dry_label = $dry_run ? ' [DRY-RUN]' : '';

    return [
        'success' => true,
        'dry_run' => $dry_run,
        'found'   => count( $pages_info ),
        'deleted' => $deleted,
        'pages'   => $pages_info,
        'message' => "{$deleted} Testseite(n) " . ( $dry_run ? 'würden gelöscht werden' : 'gelöscht' ) . $dry_label,
    ];
}
