<?php
/**
 * Novamira Ability: adrians-list-pages
 *
 * Ability-Name:  novamira-adrianv2/adrians-list-pages
 * Version:       1.0.0
 *
 * Listet WordPress-Seiten mit Filter für Elementor-Seiten, Status,
 * Suche und Sortierung. Gibt Post-ID, Titel, Slug, URL und Elementor-Status zurück.
 *
 * Parameter:
 *   {
 *     "per_page":      int     optional - Anzahl Ergebnisse (default: 50, max: 200)
 *     "page":          int     optional - Seite für Pagination (default: 1)
 *     "elementor_only": bool   optional - Nur Seiten mit Elementor-Daten (default: false)
 *     "status":        string  optional - "any"|"publish"|"draft"|"private" (default: "any")
 *     "search":        string  optional - Titelsuche (LIKE)
 *     "post_type":     string  optional - "page"|"post"|"any" (default: "page")
 *     "order_by":      string  optional - "title"|"date"|"modified"|"ID" (default: "title")
 *     "order":         string  optional - "ASC"|"DESC" (default: "ASC")
 *   }
 *
 * Rückgabe:
 *   {
 *     "success": bool,
 *     "total": int,
 *     "pages": int,
 *     "current_page": int,
 *     "items": [
 *       {
 *         "post_id": int, "title": string, "slug": string, "status": string,
 *         "url": string, "elementor": bool, "post_type": string,
 *         "modified": string, "template": string
 *       }
 *     ]
 *   }
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/adrians-helpers.php';

function novamira_adrians_list_pages( array $params ): array {

    if ( ! current_user_can( 'manage_options' ) ) {
        return [ 'success' => false, 'message' => 'Fehlende Berechtigung: manage_options erforderlich.' ];
    }

    $per_page       = min( absint( $params['per_page']  ?? 50 ), 200 );
    $page           = max( absint( $params['page']       ?? 1 ), 1 );
    $elementor_only = ! empty( $params['elementor_only'] );
    $status         = sanitize_key( $params['status']    ?? 'any' );
    $search         = sanitize_text_field( $params['search']   ?? '' );
    $post_type      = sanitize_key( $params['post_type'] ?? 'page' );
    $order_by       = in_array( $params['order_by'] ?? '', [ 'title', 'date', 'modified', 'ID' ], true )
                        ? $params['order_by'] : 'title';
    $order          = strtoupper( $params['order'] ?? 'ASC' ) === 'DESC' ? 'DESC' : 'ASC';

    // Post-Type validieren
    $allowed_types = [ 'page', 'post', 'any' ];
    if ( ! in_array( $post_type, $allowed_types, true ) ) {
        $post_type = 'page';
    }

    // WP_Query aufbauen
    $query_args = [
        'post_type'      => $post_type === 'any' ? [ 'page', 'post' ] : $post_type,
        'post_status'    => $status === 'any' ? [ 'publish', 'draft', 'private', 'pending' ] : $status,
        'posts_per_page' => $per_page,
        'paged'          => $page,
        'orderby'        => $order_by,
        'order'          => $order,
        'no_found_rows'  => false,
    ];

    if ( $search ) {
        $query_args['s'] = $search;
    }

    // Elementor-Filter: nur Seiten mit _elementor_data Meta
    if ( $elementor_only ) {
        $query_args['meta_query'] = [ [
            'key'     => '_elementor_data',
            'compare' => 'EXISTS',
        ] ];
    }

    $q = new WP_Query( $query_args );

    $items = [];
    foreach ( $q->posts as $post ) {
        $has_elementor = ! empty( get_post_meta( $post->ID, '_elementor_data', true ) );
        $template      = get_post_meta( $post->ID, '_wp_page_template', true ) ?: 'default';

        $items[] = [
            'post_id'   => $post->ID,
            'title'     => $post->post_title,
            'slug'      => $post->post_name,
            'status'    => $post->post_status,
            'url'       => get_permalink( $post->ID ),
            'elementor' => $has_elementor,
            'post_type' => $post->post_type,
            'modified'  => $post->post_modified,
            'template'  => $template,
        ];
    }

    return [
        'success'      => true,
        'total'        => (int) $q->found_posts,
        'pages'        => (int) $q->max_num_pages,
        'current_page' => $page,
        'items'        => $items,
    ];
}
