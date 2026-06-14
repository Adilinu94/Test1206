<?php
/**
 * Novamira Ability: adrians-update-page
 *
 * Ability-Name:  novamira-adrianv2/adrians-update-page
 * Version:       1.0.0
 *
 * Setzt Seiten-Titel, Status, Slug und Template direkt — ohne novamira/execute-php
 * mit wp_update_post() schreiben zu müssen. Ersetzt den häufigen Workaround im
 * Workflow für Draft→Publish, Titelkorrekturen und Template-Wechsel.
 *
 * Deckt beide ursprünglich geplanten Abilities ab:
 *   - adrians-set-page-title  → "title" Parameter
 *   - adrians-set-page-status → "status" Parameter
 *
 * Parameter:
 *   {
 *     "post_id":  int     PFLICHT - WordPress Post-ID
 *     "title":    string  optional - Neuer Seiten-Titel
 *     "status":   string  optional - "draft" | "publish" | "private" | "pending"
 *     "slug":     string  optional - Neuer Post-Slug (post_name)
 *     "template": string  optional - WP-Template (z.B. "elementor_canvas", "default")
 *     "parent_id": int    optional - Neuer Parent-Post (0 = kein Parent)
 *   }
 *
 * Rückgabe:
 *   {
 *     "success": bool, "post_id": int,
 *     "updated_fields": string[],
 *     "before": { "title": string, "status": string, "slug": string, "template": string },
 *     "after":  { "title": string, "status": string, "slug": string, "template": string },
 *     "url": string, "message": string
 *   }
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/adrians-helpers.php';

function novamira_adrians_update_page( array $params ): array {

    if ( ! current_user_can( 'manage_options' ) ) {
        return [ 'success' => false, 'message' => 'Fehlende Berechtigung: manage_options erforderlich.' ];
    }

    $post_id = absint( $params['post_id'] ?? 0 );
    if ( ! $post_id ) {
        return [ 'success' => false, 'message' => '"post_id" fehlt.' ];
    }

    $post = get_post( $post_id );
    if ( ! $post ) {
        return [ 'success' => false, 'message' => "Post $post_id nicht gefunden." ];
    }

    // ── Vorher-Status festhalten ───────────────────────────────────────
    $before = [
        'title'    => $post->post_title,
        'status'   => $post->post_status,
        'slug'     => $post->post_name,
        'template' => get_post_meta( $post_id, '_wp_page_template', true ) ?: 'default',
    ];

    // ── Update-Array aufbauen ──────────────────────────────────────────
    $update         = [ 'ID' => $post_id ];
    $updated_fields = [];

    if ( isset( $params['title'] ) && trim( $params['title'] ) !== '' ) {
        $new_title = sanitize_text_field( $params['title'] );
        if ( $new_title !== $post->post_title ) {
            $update['post_title'] = $new_title;
            $updated_fields[]     = 'title';
        }
    }

    $allowed_statuses = [ 'draft', 'publish', 'private', 'pending', 'trash' ];
    if ( isset( $params['status'] ) && in_array( $params['status'], $allowed_statuses, true ) ) {
        if ( $params['status'] !== $post->post_status ) {
            $update['post_status'] = $params['status'];
            $updated_fields[]      = 'status';
        }
    }

    if ( isset( $params['slug'] ) && trim( $params['slug'] ) !== '' ) {
        $new_slug = sanitize_title( $params['slug'] );
        if ( $new_slug !== $post->post_name ) {
            $update['post_name'] = $new_slug;
            $updated_fields[]    = 'slug';
        }
    }

    if ( isset( $params['parent_id'] ) ) {
        $new_parent = absint( $params['parent_id'] );
        if ( $new_parent !== $post->post_parent ) {
            $update['post_parent'] = $new_parent;
            $updated_fields[]      = 'parent_id';
        }
    }

    // ── wp_update_post (nur wenn es Änderungen gibt) ───────────────────
    if ( count( $update ) > 1 ) {
        $result = wp_update_post( $update, true );
        if ( is_wp_error( $result ) ) {
            return [
                'success' => false,
                'message' => 'wp_update_post fehlgeschlagen: ' . $result->get_error_message(),
            ];
        }
    }

    // ── Template separat via Meta (nicht Teil von wp_update_post) ─────
    if ( isset( $params['template'] ) ) {
        $new_template = sanitize_text_field( $params['template'] );
        if ( $new_template !== $before['template'] ) {
            update_post_meta( $post_id, '_wp_page_template', $new_template );
            $updated_fields[] = 'template';
        }
    }

    if ( empty( $updated_fields ) ) {
        return [
            'success'        => true,
            'post_id'        => $post_id,
            'updated_fields' => [],
            'before'         => $before,
            'after'          => $before,
            'url'            => get_permalink( $post_id ),
            'message'        => "Keine Änderungen — alle übergebenen Werte sind identisch mit dem aktuellen Stand.",
        ];
    }

    // ── Aktuellen Stand nach Update lesen ─────────────────────────────
    $post_after = get_post( $post_id );
    $after = [
        'title'    => $post_after->post_title,
        'status'   => $post_after->post_status,
        'slug'     => $post_after->post_name,
        'template' => get_post_meta( $post_id, '_wp_page_template', true ) ?: 'default',
    ];

    return [
        'success'        => true,
        'post_id'        => $post_id,
        'updated_fields' => $updated_fields,
        'before'         => $before,
        'after'          => $after,
        'url'            => get_permalink( $post_id ),
        'message'        => "Post $post_id aktualisiert: " . implode( ', ', $updated_fields ) . ".",
    ];
}
