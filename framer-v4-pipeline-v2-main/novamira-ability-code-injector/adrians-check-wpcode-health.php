<?php
/**
 * Novamira Ability: adrians-check-wpcode-health
 *
 * Ability-Name:  novamira-adrianv2/adrians-check-wpcode-health
 * Version:       1.0.0
 *
 * Prüft den Gesundheitszustand des WPCode-Plugins BEVOR die Snippet-Injection
 * startet. Gibt Auskunft über aktive Snippets, PHP-Fehler in bestehenden
 * Snippets und potenzielle Konflikte.
 *
 * Präventionscheck: 1 Minute Aufwand vor potenziellem Stundenausfall.
 *
 * Parameter:
 *   {
 *     "check_php_errors":    bool  optional - PHP-Fehler in Snippets prüfen (default: true)
 *     "check_conflicts":     bool  optional - Konflikte zwischen Snippets prüfen (default: true)
 *   }
 *
 * Rückgabe:
 *   {
 *     "success": bool,
 *     "wpcode_active": bool,
 *     "wpcode_version": string|null,
 *     "overall_status": "ok" | "warning" | "error",
 *     "snippet_counts": {
 *       "total": int, "active": int, "draft": int,
 *       "php": int, "css": int, "js": int, "html": int
 *     },
 *     "php_errors": [{ "snippet_id": int, "title": string, "error": string }],
 *     "conflicting_snippets": [{ "title_a": string, "title_b": string, "conflict": string }],
 *     "warnings": string[],
 *     "message": string
 *   }
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/adrians-helpers.php';

function novamira_adrians_check_wpcode_health( array $params ): array {

    if ( ! current_user_can( 'manage_options' ) ) {
        return [ 'success' => false, 'message' => 'Fehlende Berechtigung: manage_options erforderlich.' ];
    }

    $check_php_errors = isset( $params['check_php_errors'] ) ? (bool) $params['check_php_errors'] : true;
    $check_conflicts  = isset( $params['check_conflicts'] )  ? (bool) $params['check_conflicts']  : true;

    // ── WPCode aktiv? ──────────────────────────────────────────────────
    $wpcode_active  = post_type_exists( 'wpcode_snippet' )
                   || class_exists( 'WPCode_Auto_Insert' )
                   || function_exists( 'wpcode_get_snippet' );

    $wpcode_version = null;
    if ( defined( 'WPCODE_VERSION' ) ) {
        $wpcode_version = WPCODE_VERSION;
    } elseif ( function_exists( 'get_plugins' ) ) {
        $plugins = get_plugins();
        foreach ( $plugins as $path => $data ) {
            if ( strpos( $path, 'wpcode' ) !== false || strpos( $path, 'insert-headers-and-footers' ) !== false ) {
                $wpcode_version = $data['Version'] ?? 'unknown';
                break;
            }
        }
    }

    if ( ! $wpcode_active ) {
        return [
            'success'        => true,
            'wpcode_active'  => false,
            'wpcode_version' => null,
            'overall_status' => 'error',
            'message'        => 'WPCode ist NICHT aktiv. Snippet-Injection wird fehlschlagen!',
        ];
    }

    // ── Snippets zählen ────────────────────────────────────────────────
    $all_snippets = get_posts( [
        'post_type'      => 'wpcode_snippet',
        'post_status'    => [ 'publish', 'draft', 'trash', 'private' ],
        'posts_per_page' => -1,
        'no_found_rows'  => false,
    ] );

    $counts = [
        'total'  => count( $all_snippets ),
        'active' => 0,
        'draft'  => 0,
        'php'    => 0,
        'css'    => 0,
        'js'     => 0,
        'html'   => 0,
    ];

    $php_snippets = [];

    foreach ( $all_snippets as $snippet ) {
        if ( $snippet->post_status === 'publish' ) $counts['active']++;
        if ( $snippet->post_status === 'draft' )   $counts['draft']++;

        $type = get_post_meta( $snippet->ID, '_wpcode_snippet_type', true ) ?: 'php';
        if ( isset( $counts[ $type ] ) ) {
            $counts[ $type ]++;
        }
        if ( $type === 'php' && $snippet->post_status === 'publish' ) {
            $php_snippets[] = $snippet;
        }
    }

    // ── PHP-Fehler in aktiven PHP-Snippets prüfen ──────────────────────
    $php_errors = [];

    if ( $check_php_errors && ! empty( $php_snippets ) ) {
        // Basis-Prüfung: token_get_all auf den Code anwenden
        foreach ( $php_snippets as $snippet ) {
            $code = $snippet->post_content;
            if ( empty( trim( $code ) ) ) {
                $php_errors[] = [
                    'snippet_id' => $snippet->ID,
                    'title'      => $snippet->post_title,
                    'error'      => 'Leerer PHP-Snippet-Code.',
                ];
                continue;
            }

            // Syntax-Check via php -l (falls CLI verfügbar)
            $tmp_file = tempnam( sys_get_temp_dir(), 'wpcode_' );
            file_put_contents( $tmp_file, $code );
            $output = [];
            $return = 0;
            exec( 'php -l ' . escapeshellarg( $tmp_file ) . ' 2>&1', $output, $return );
            unlink( $tmp_file );

            if ( $return !== 0 ) {
                $error_msg = implode( ' ', $output );
                // Pfad aus Fehlermeldung entfernen (Privacy)
                $error_msg = preg_replace( '/in\s+\/[^\s]+/', 'in <snippet>', $error_msg );
                $php_errors[] = [
                    'snippet_id' => $snippet->ID,
                    'title'      => $snippet->post_title,
                    'error'      => trim( $error_msg ),
                ];
            }
        }
    }

    // ── Konflikte erkennen ─────────────────────────────────────────────
    $conflicts = [];

    if ( $check_conflicts ) {
        // Doppelte Snippet-Titel suchen (häufigster Konflikt)
        $titles    = array_column( $all_snippets, 'post_title', 'ID' );
        $seen      = [];
        $dupes     = [];

        foreach ( $titles as $id => $title ) {
            $key = strtolower( trim( $title ) );
            if ( isset( $seen[ $key ] ) ) {
                $dupes[] = $title;
                $conflicts[] = [
                    'title_a'  => $title,
                    'title_b'  => $title,
                    'conflict' => 'Doppelter Snippet-Titel — kann zu Upsert-Problemen führen.',
                ];
            }
            $seen[ $key ] = $id;
        }
    }

    // ── Warnungen zusammenstellen ──────────────────────────────────────
    $warnings = [];

    if ( $counts['total'] > 100 ) {
        $warnings[] = "Hohe Snippet-Anzahl ({$counts['total']}): Performance bei WP_Query-Loads kann sinken.";
    }
    if ( ! empty( $php_errors ) ) {
        $warnings[] = count( $php_errors ) . ' PHP-Snippet(s) mit Syntax-Fehlern gefunden.';
    }
    if ( ! empty( $conflicts ) ) {
        $warnings[] = count( $conflicts ) . ' Snippet-Konflikte gefunden.';
    }

    // ── Overall Status ─────────────────────────────────────────────────
    $overall_status = 'ok';
    if ( ! empty( $php_errors ) )  $overall_status = 'error';
    elseif ( ! empty( $warnings ) ) $overall_status = 'warning';

    return [
        'success'              => true,
        'wpcode_active'        => true,
        'wpcode_version'       => $wpcode_version,
        'overall_status'       => $overall_status,
        'snippet_counts'       => $counts,
        'php_errors'           => $php_errors,
        'conflicting_snippets' => $conflicts,
        'warnings'             => $warnings,
        'message'              => $overall_status === 'ok'
            ? "WPCode gesund: {$counts['active']} aktive Snippets, keine Fehler."
            : ( $overall_status === 'error'
                ? count( $php_errors ) . " PHP-Fehler in aktiven Snippets — Injection stoppen!"
                : "WPCode aktiv mit Warnungen: " . implode( ' | ', $warnings ) ),
    ];
}
