<?php
/**
 * Novamira Ability: adrians-restore-gc-snapshot
 *
 * Ability-Name:  novamira-adrianv2/adrians-restore-gc-snapshot
 * Version:       1.0.0
 *
 * Stellt einen GC/GV-Snapshot wieder her, der mit adrians-export-gc-snapshot
 * erstellt wurde. Rollback-Ergänzung für Design-System-Änderungen.
 *
 * SICHERHEIT: dry_run ist per Default true — Änderungen passieren nur
 * bei explizitem dry_run: false.
 *
 * Parameter:
 *   {
 *     "snapshot":           object  PFLICHT - Output von adrians-export-gc-snapshot
 *     "dry_run":            bool    optional - Nur simulieren, keine Änderungen (default: true)
 *     "mode":               string  optional - "merge"|"replace" (default: "merge")
 *                                    merge   = bestehende GCs/GVs behalten, nur fehlende ergänzen
 *                                    replace = alle bestehenden überschreiben
 *     "restore_classes":    bool    optional - GCs wiederherstellen (default: true)
 *     "restore_variables":  bool    optional - GVs wiederherstellen (default: true)
 *   }
 *
 * Rückgabe:
 *   {
 *     "success": bool, "dry_run": bool, "mode": string,
 *     "classes":   { "processed": int, "created": int, "updated": int, "skipped": int },
 *     "variables": { "processed": int, "created": int, "updated": int, "skipped": int },
 *     "errors": string[],
 *     "message": string
 *   }
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/adrians-helpers.php';

function novamira_adrians_restore_gc_snapshot( array $params ): array {

    if ( ! current_user_can( 'manage_options' ) ) {
        return [ 'success' => false, 'message' => 'Fehlende Berechtigung: manage_options erforderlich.' ];
    }

    // ── Parameter validieren ───────────────────────────────────────────
    $snapshot = $params['snapshot'] ?? null;

    if ( ! is_array( $snapshot ) || empty( $snapshot['snapshot_version'] ) ) {
        return [
            'success' => false,
            'message' => 'Ungültiger Snapshot. Nur Outputs von adrians-export-gc-snapshot akzeptiert.',
        ];
    }

    $dry_run           = isset( $params['dry_run'] ) ? (bool) $params['dry_run'] : true;
    $mode              = in_array( $params['mode'] ?? 'merge', [ 'merge', 'replace' ], true )
                            ? $params['mode'] : 'merge';
    $restore_classes   = isset( $params['restore_classes'] )   ? (bool) $params['restore_classes']   : true;
    $restore_variables = isset( $params['restore_variables'] ) ? (bool) $params['restore_variables'] : true;

    $gc_data    = $snapshot['global_classes']   ?? [];
    $gv_data    = $snapshot['global_variables'] ?? [];
    $errors     = [];

    // ── Stats-Zähler ───────────────────────────────────────────────────
    $gc_stats = [ 'processed' => 0, 'created' => 0, 'updated' => 0, 'skipped' => 0 ];
    $gv_stats = [ 'processed' => 0, 'created' => 0, 'updated' => 0, 'skipped' => 0 ];

    // ── Global Classes wiederherstellen ────────────────────────────────
    if ( $restore_classes && ! empty( $gc_data ) ) {

        if ( $mode === 'replace' && ! $dry_run ) {
            // Bestehende GC-Option komplett überschreiben
            update_option( 'elementor_global_classes', wp_json_encode( $gc_data ) );
            $gc_stats['processed'] = count( $gc_data );
            $gc_stats['updated']   = count( $gc_data );
        } else {
            // Merge: bestehende GC-Option lesen, fehlende ergänzen
            $existing_raw = get_option( 'elementor_global_classes', '[]' );
            $existing     = is_string( $existing_raw )
                            ? ( json_decode( $existing_raw, true ) ?: [] )
                            : ( is_array( $existing_raw ) ? $existing_raw : [] );

            // Indexiere bestehende GCs by ID
            $existing_by_id = [];
            foreach ( $existing as $gc ) {
                if ( isset( $gc['id'] ) ) {
                    $existing_by_id[ $gc['id'] ] = $gc;
                }
            }

            foreach ( $gc_data as $gc ) {
                $gc_stats['processed']++;
                $id = $gc['id'] ?? null;

                if ( ! $id ) {
                    $errors[] = 'GC ohne ID übersprungen.';
                    $gc_stats['skipped']++;
                    continue;
                }

                if ( isset( $existing_by_id[ $id ] ) ) {
                    if ( $mode === 'merge' ) {
                        $gc_stats['skipped']++;
                        continue; // Merge: bestehende nicht überschreiben
                    }
                    // Replace in merge-loop (einzeln): update
                    if ( ! $dry_run ) {
                        $existing_by_id[ $id ] = $gc;
                    }
                    $gc_stats['updated']++;
                } else {
                    if ( ! $dry_run ) {
                        $existing_by_id[ $id ] = $gc;
                    }
                    $gc_stats['created']++;
                }
            }

            if ( ! $dry_run ) {
                update_option( 'elementor_global_classes', wp_json_encode( array_values( $existing_by_id ) ) );
            }
        }
    }

    // ── Global Variables wiederherstellen ──────────────────────────────
    if ( $restore_variables && ! empty( $gv_data ) ) {

        if ( $mode === 'replace' && ! $dry_run ) {
            update_option( 'elementor_global_variables', wp_json_encode( $gv_data ) );
            $gv_stats['processed'] = count( $gv_data );
            $gv_stats['updated']   = count( $gv_data );
        } else {
            $existing_raw = get_option( 'elementor_global_variables', '[]' );
            $existing     = is_string( $existing_raw )
                            ? ( json_decode( $existing_raw, true ) ?: [] )
                            : ( is_array( $existing_raw ) ? $existing_raw : [] );

            $existing_by_id = [];
            foreach ( $existing as $gv ) {
                if ( isset( $gv['id'] ) ) {
                    $existing_by_id[ $gv['id'] ] = $gv;
                }
            }

            foreach ( $gv_data as $gv ) {
                $gv_stats['processed']++;
                $id = $gv['id'] ?? null;

                if ( ! $id ) {
                    $errors[] = 'GV ohne ID übersprungen.';
                    $gv_stats['skipped']++;
                    continue;
                }

                if ( isset( $existing_by_id[ $id ] ) ) {
                    if ( $mode === 'merge' ) {
                        $gv_stats['skipped']++;
                        continue;
                    }
                    if ( ! $dry_run ) {
                        $existing_by_id[ $id ] = $gv;
                    }
                    $gv_stats['updated']++;
                } else {
                    if ( ! $dry_run ) {
                        $existing_by_id[ $id ] = $gv;
                    }
                    $gv_stats['created']++;
                }
            }

            if ( ! $dry_run ) {
                update_option( 'elementor_global_variables', wp_json_encode( array_values( $existing_by_id ) ) );
            }
        }

        // Elementor-Cache nach Wiederherstellung löschen
        if ( ! $dry_run && class_exists( '\Elementor\Plugin' ) ) {
            \Elementor\Plugin::$instance->files_manager->clear_cache();
        }
    }

    $dry_label   = $dry_run ? ' [DRY-RUN — keine Änderungen geschrieben]' : '';
    $src_url     = $snapshot['wp_site_url'] ?? 'unbekannt';
    $src_ts      = $snapshot['timestamp']   ?? 'unbekannt';

    return [
        'success'   => true,
        'dry_run'   => $dry_run,
        'mode'      => $mode,
        'source'    => [ 'site_url' => $src_url, 'timestamp' => $src_ts ],
        'classes'   => $gc_stats,
        'variables' => $gv_stats,
        'errors'    => $errors,
        'message'   => "GC/GV-Snapshot ({$mode}-Modus) verarbeitet{$dry_label}. "
                     . "GCs: {$gc_stats['created']} erstellt, {$gc_stats['updated']} aktualisiert. "
                     . "GVs: {$gv_stats['created']} erstellt, {$gv_stats['updated']} aktualisiert.",
    ];
}
