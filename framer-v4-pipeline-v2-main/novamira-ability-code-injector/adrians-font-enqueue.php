<?php
/**
 * Novamira Ability: adrians-font-enqueue
 *
 * Ability-Name:  novamira-adrianv2/adrians-font-enqueue
 * Version:       1.0.0
 *
 * Schließt die Lücke im Font-Workflow: resolve-fonts.js identifiziert Schriften,
 * diese Ability enqueued sie in WordPress — entweder als Google Fonts <link>-Tag
 * oder als lokales @font-face via WPCode-Snippet.
 *
 * Methoden:
 *   "google"  → Erstellt WPCode-PHP-Snippet mit wp_enqueue_style(Google Fonts URL)
 *   "local"   → Erstellt WPCode-CSS-Snippet mit @font-face { src: url(WP-Media-URL) }
 *               Datei-Upload erfolgt SEPARAT via novamira/adrians-media-upload
 *
 * Parameter:
 *   {
 *     "font_family":    string   PFLICHT  - Schriftfamilien-Name (z.B. "Inter")
 *     "source":         string   PFLICHT  - "google" | "local"
 *     "weights":        string[] optional - ["400","500","700"] (default: ["400","700"])
 *     "google_url":     string   optional - Vollständige Google Fonts URL (überschreibt Auto-Build)
 *     "local_url":      string   optional - WordPress-Media-URL zur .woff2-Datei (für source=local)
 *     "display":        string   optional - "swap"|"auto"|"block" (default: "swap")
 *     "location":       string   optional - WPCode location: "wp_head"|"wp_enqueue_scripts" (default: "wp_head")
 *     "snippet_title":  string   optional - Titel des WPCode-Snippets (default: "font-{family}")
 *     "update_mode":    string   optional - "create"|"upsert" (default: "upsert")
 *   }
 *
 * Rückgabe:
 *   {
 *     "success": bool, "font_family": string, "source": string,
 *     "method": string, "snippet_id": int, "snippet_title": string,
 *     "code_preview": string, "message": string
 *   }
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/adrians-helpers.php';

function novamira_adrians_font_enqueue( array $params ): array {

    if ( ! current_user_can( 'manage_options' ) ) {
        return [ 'success' => false, 'message' => 'Fehlende Berechtigung: manage_options erforderlich.' ];
    }

    // ── Parameter validieren ───────────────────────────────────────────
    $font_family   = sanitize_text_field( $params['font_family'] ?? '' );
    $source        = sanitize_key( $params['source'] ?? '' );
    $weights       = ! empty( $params['weights'] ) && is_array( $params['weights'] )
                        ? array_map( 'sanitize_key', $params['weights'] )
                        : [ '400', '700' ];
    $google_url    = esc_url_raw( $params['google_url'] ?? '' );
    $local_url     = esc_url_raw( $params['local_url']  ?? '' );
    $display       = in_array( $params['display'] ?? 'swap', [ 'swap', 'auto', 'block', 'fallback', 'optional' ], true )
                        ? $params['display'] : 'swap';
    $location      = in_array( $params['location'] ?? 'wp_head', [ 'wp_head', 'wp_enqueue_scripts', 'wp_footer' ], true )
                        ? $params['location'] : 'wp_head';
    $snippet_title = sanitize_text_field( $params['snippet_title'] ?? '' ) ?: 'font-' . strtolower( str_replace( ' ', '-', $font_family ) );
    $update_mode   = in_array( $params['update_mode'] ?? 'upsert', [ 'create', 'upsert' ], true )
                        ? $params['update_mode'] : 'upsert';

    if ( ! $font_family ) {
        return [ 'success' => false, 'message' => 'Parameter "font_family" fehlt.' ];
    }
    if ( ! in_array( $source, [ 'google', 'local' ], true ) ) {
        return [ 'success' => false, 'message' => 'Parameter "source" muss "google" oder "local" sein.' ];
    }
    if ( $source === 'local' && ! $local_url ) {
        return [ 'success' => false, 'message' => 'Für source=local ist "local_url" (WordPress-Media-URL zur .woff2) erforderlich.' ];
    }

    // ── Code generieren ────────────────────────────────────────────────
    if ( $source === 'google' ) {
        $code = novamira_build_google_font_code( $font_family, $weights, $display, $google_url, $snippet_title );
        $type = 'php';
    } else {
        $code = novamira_build_local_font_code( $font_family, $weights, $local_url, $display );
        $type = 'css';
    }

    // ── WPCode Snippet erstellen oder aktualisieren ────────────────────
    $existing_id = novamira_find_wpcode_snippet( $snippet_title );

    if ( $existing_id && $update_mode === 'upsert' ) {
        // Update bestehenden Snippet
        wp_update_post( [
            'ID'           => $existing_id,
            'post_content' => $code,
            'post_status'  => 'publish',
        ] );
        update_post_meta( $existing_id, '_wpcode_snippet_type',            $type );
        update_post_meta( $existing_id, '_wpcode_auto_insert_location',    $location );
        update_post_meta( $existing_id, '_wpcode_auto_insert',             1 );
        delete_transient( 'wpcode_snippets' );
        $snippet_id = $existing_id;
        $action     = 'updated';
    } elseif ( ! $existing_id || $update_mode === 'create' ) {
        // Neu anlegen
        $snippet_id = wp_insert_post( [
            'post_type'    => 'wpcode_snippet',
            'post_title'   => $snippet_title,
            'post_content' => $code,
            'post_status'  => 'publish',
        ] );
        if ( is_wp_error( $snippet_id ) ) {
            return [ 'success' => false, 'message' => 'WPCode-Snippet konnte nicht erstellt werden: ' . $snippet_id->get_error_message() ];
        }
        update_post_meta( $snippet_id, '_wpcode_snippet_type',         $type );
        update_post_meta( $snippet_id, '_wpcode_auto_insert_location', $location );
        update_post_meta( $snippet_id, '_wpcode_auto_insert',          1 );
        $action = 'created';
    } else {
        $snippet_id = $existing_id;
        $action     = 'skipped';
    }

    return [
        'success'       => true,
        'font_family'   => $font_family,
        'source'        => $source,
        'method'        => $source === 'google' ? 'wp_enqueue_style (Google Fonts)' : '@font-face (local woff2)',
        'snippet_id'    => $snippet_id,
        'snippet_title' => $snippet_title,
        'action'        => $action,
        'type'          => $type,
        'location'      => $location,
        'code_preview'  => substr( $code, 0, 200 ) . ( strlen( $code ) > 200 ? '…' : '' ),
        'message'       => "Font \"$font_family\" ($source) als WPCode-Snippet \"$snippet_title\" $action.",
    ];
}

/**
 * Generiert PHP-Snippet-Code für Google Fonts via wp_enqueue_style.
 */
function novamira_build_google_font_code( string $family, array $weights, string $display, string $custom_url, string $handle ): string {
    $handle_slug = preg_replace( '/[^a-z0-9-]/', '-', strtolower( $handle ) );

    if ( $custom_url ) {
        $url = $custom_url;
    } else {
        // Google Fonts URL aufbauen (APIv2)
        $family_param = urlencode( $family ) . ':wght@' . implode( ';', $weights );
        $url = 'https://fonts.googleapis.com/css2?family=' . $family_param . '&display=' . $display;
    }

    return "<?php\nadd_action( 'wp_enqueue_scripts', function() {\n    wp_enqueue_style(\n        '$handle_slug',\n        '$url',\n        [],\n        null\n    );\n}, 5 );\n";
}

/**
 * Generiert CSS-Snippet-Code für lokale @font-face Deklaration.
 */
function novamira_build_local_font_code( string $family, array $weights, string $woff2_url, string $display ): string {
    $css = '';
    // Wenn nur eine URL, alle Weights auf diese URL mappen
    foreach ( $weights as $weight ) {
        $css .= "@font-face {\n";
        $css .= "  font-family: '{$family}';\n";
        $css .= "  font-style: normal;\n";
        $css .= "  font-weight: {$weight};\n";
        $css .= "  font-display: {$display};\n";
        $css .= "  src: url('{$woff2_url}') format('woff2');\n";
        $css .= "}\n\n";
    }
    return rtrim( $css );
}
