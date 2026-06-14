<?php
/**
 * Novamira Ability: adrians-bulk-patch-styles
 *
 * Ability-Name:  novamira-adrianv2/adrians-bulk-patch-styles
 * Version:       1.0.0
 *
 * Patcht Styles auf mehreren Elementen gleichzeitig — entweder by Widget-Typ,
 * explizite Element-IDs, oder CSS-Klasse. Löst das N-Calls-Problem von
 * adrians-patch-element-styles bei Design-Änderungen (z.B. alle Headings
 * auf neue Farbe setzen).
 *
 * Parameter:
 *   {
 *     "post_id":     int      PFLICHT - WordPress Post-ID der Elementor-Seite
 *     "target":      string   PFLICHT - "widget_type" | "element_ids" | "css_class"
 *     "widget_type": string   optional - z.B. "e-heading", "e-paragraph" (für target=widget_type)
 *     "element_ids": string[] optional - z.B. ["abc123", "def456"] (für target=element_ids)
 *     "css_class":   string   optional - GC-ID oder Klasse (für target=css_class)
 *     "patches":     object   PFLICHT - Key-Value Props: { "color": {...}, "font_size": {...} }
 *                              Werte müssen Elementor V4 Prop-Format haben:
 *                              { "$$type": "global-color-variable", "value": "e-gv-abc1234" }
 *     "dry_run":     bool     optional - Nur simulieren (default: false)
 *   }
 *
 * Rückgabe:
 *   {
 *     "success": bool, "post_id": int, "target": string,
 *     "elements_found": int, "elements_patched": int,
 *     "dry_run": bool, "patches_applied": string[],
 *     "element_ids_patched": string[], "message": string
 *   }
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/adrians-helpers.php';

function novamira_adrians_bulk_patch_styles( array $params ): array {

    if ( ! current_user_can( 'manage_options' ) ) {
        return [ 'success' => false, 'message' => 'Fehlende Berechtigung: manage_options erforderlich.' ];
    }

    // ── Parameter validieren ───────────────────────────────────────────
    $post_id     = absint( $params['post_id'] ?? 0 );
    $target      = sanitize_key( $params['target'] ?? '' );
    $patches     = $params['patches'] ?? null;
    $dry_run     = (bool) ( $params['dry_run'] ?? false );

    if ( ! $post_id )  return [ 'success' => false, 'message' => '"post_id" fehlt.' ];
    if ( ! $target )   return [ 'success' => false, 'message' => '"target" fehlt (widget_type | element_ids | css_class).' ];
    if ( ! is_array( $patches ) || empty( $patches ) ) {
        return [ 'success' => false, 'message' => '"patches" muss ein nicht-leeres Objekt sein.' ];
    }

    $allowed_targets = [ 'widget_type', 'element_ids', 'css_class' ];
    if ( ! in_array( $target, $allowed_targets, true ) ) {
        return [ 'success' => false, 'message' => "Ungültiger target. Erlaubt: " . implode( ', ', $allowed_targets ) ];
    }

    // Target-Parameter validieren
    $widget_type = sanitize_text_field( $params['widget_type'] ?? '' );
    $element_ids = array_map( 'sanitize_text_field', (array) ( $params['element_ids'] ?? [] ) );
    $css_class   = sanitize_text_field( $params['css_class'] ?? '' );

    if ( $target === 'widget_type' && ! $widget_type ) {
        return [ 'success' => false, 'message' => 'target=widget_type benötigt "widget_type" Parameter.' ];
    }
    if ( $target === 'element_ids' && empty( $element_ids ) ) {
        return [ 'success' => false, 'message' => 'target=element_ids benötigt "element_ids" Array.' ];
    }
    if ( $target === 'css_class' && ! $css_class ) {
        return [ 'success' => false, 'message' => 'target=css_class benötigt "css_class" Parameter.' ];
    }

    // ── Elementor-Daten laden ──────────────────────────────────────────
    $raw = get_post_meta( $post_id, '_elementor_data', true );
    if ( ! $raw ) {
        return [ 'success' => false, 'message' => "Post $post_id hat keine Elementor-Daten." ];
    }

    $tree = json_decode( $raw, true );
    if ( ! is_array( $tree ) ) {
        return [ 'success' => false, 'message' => 'Elementor-Daten konnten nicht geparst werden.' ];
    }

    // ── Elemente suchen und patchen ────────────────────────────────────
    $found_count   = 0;
    $patched_count = 0;
    $patched_ids   = [];

    novamira_bulk_walk( $tree, $target, $widget_type, $element_ids, $css_class, $patches, $dry_run, $found_count, $patched_count, $patched_ids );

    // ── Zurückschreiben (wenn nicht dry_run) ───────────────────────────
    if ( ! $dry_run && $patched_count > 0 ) {
        update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $tree ) ) );
        // Elementor-CSS neu erzeugen
        if ( class_exists( '\Elementor\Plugin' ) ) {
            \Elementor\Plugin::$instance->files_manager->clear_cache();
        }
    }

    $dry_label = $dry_run ? ' [DRY-RUN]' : '';

    return [
        'success'             => true,
        'post_id'             => $post_id,
        'target'              => $target,
        'target_value'        => $target === 'widget_type' ? $widget_type
                                 : ( $target === 'element_ids' ? $element_ids : $css_class ),
        'elements_found'      => $found_count,
        'elements_patched'    => $patched_count,
        'dry_run'             => $dry_run,
        'patches_applied'     => array_keys( $patches ),
        'element_ids_patched' => $patched_ids,
        'message'             => "{$patched_count}/{$found_count} Elemente gepatcht{$dry_label}.",
    ];
}

/**
 * Rekursiv alle Elementor-Elemente durchsuchen und Patches anwenden.
 *
 * @param array    &$elements  Elementor-Element-Array (per Referenz)
 * @param string   $target     "widget_type" | "element_ids" | "css_class"
 * @param string   $wtype      Widget-Typ-Filter
 * @param string[] $eids       Element-ID-Filter
 * @param string   $css_class  CSS-Klassen-Filter
 * @param array    $patches    Props die gesetzt werden sollen
 * @param bool     $dry_run    Keine echten Änderungen
 * @param int      &$found     Zähler gefundene Elemente
 * @param int      &$patched   Zähler gepatchte Elemente
 * @param string[] &$ids       IDs gepatchter Elemente
 */
function novamira_bulk_walk(
    array  &$elements,
    string $target,
    string $wtype,
    array  $eids,
    string $css_class,
    array  $patches,
    bool   $dry_run,
    int    &$found,
    int    &$patched,
    array  &$ids
): void {
    foreach ( $elements as &$el ) {
        $matches = false;

        if ( $target === 'widget_type' ) {
            $el_type = $el['widgetType'] ?? $el['type'] ?? '';
            $matches = ( $el_type === $wtype );
        } elseif ( $target === 'element_ids' ) {
            $matches = isset( $el['id'] ) && in_array( $el['id'], $eids, true );
        } elseif ( $target === 'css_class' ) {
            $classes = $el['settings']['classes']['value'] ?? [];
            $matches = in_array( $css_class, (array) $classes, true );
        }

        if ( $matches ) {
            $found++;
            if ( ! $dry_run ) {
                foreach ( $patches as $prop => $value ) {
                    $el['settings'][ sanitize_text_field( $prop ) ] = $value;
                }
            }
            if ( ! empty( $el['id'] ) ) {
                $ids[] = $el['id'];
            }
            $patched++;
        }

        // Kinder rekursiv durchsuchen
        if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
            novamira_bulk_walk( $el['elements'], $target, $wtype, $eids, $css_class, $patches, $dry_run, $found, $patched, $ids );
        }
    }
    unset( $el );
}
