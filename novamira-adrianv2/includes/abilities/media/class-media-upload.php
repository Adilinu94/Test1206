<?php
declare(strict_types=1);

namespace Novamira\AdrianV2\Abilities\Media;

if (!defined('ABSPATH')) {
    exit();
}

class Media_Upload
{
    public static function register(): void
    {
        wp_register_ability('novamira-adrianv2/media-upload', [
            'label'               => 'Media Upload',
            'description'         => 'Uploads a file directly to the WordPress media library via base64-encoded content. Returns attachment ID, URL, and thumbnail URLs.',
            'category'            => 'novamira-adrianv2',
            'input_schema'        => [
                'type'       => 'object',
                'properties' => [
                    'base64_content' => [
                        'type'        => 'string',
                        'description' => 'Base64-encoded file content.',
                    ],
                    'filename'       => [
                        'type'        => 'string',
                        'description' => 'Desired filename including extension (e.g. "photo.jpg"). Must include a valid file extension.',
                    ],
                    'title'          => [
                        'type'        => 'string',
                        'description' => 'Attachment title. Defaults to the filename without extension.',
                    ],
                    'caption'        => [
                        'type'        => 'string',
                        'description' => 'Optional caption for the attachment.',
                    ],
                    'alt_text'       => [
                        'type'        => 'string',
                        'description' => 'Optional alt text for images.',
                    ],
                    'description'    => [
                        'type'        => 'string',
                        'description' => 'Optional description for the attachment.',
                    ],
                    'parent_post_id' => [
                        'type'        => 'integer',
                        'description' => 'Optional parent post ID to attach this media to.',
                    ],
                ],
                'required'   => ['base64_content', 'filename'],
            ],
            'output_schema'       => [
                'type'       => 'object',
                'properties' => [
                    'success' => ['type' => 'boolean'],
                    'data'    => ['type' => 'object'],
                    'error'   => ['type' => 'string'],
                ],
            ],
            'execute_callback'    => [self::class, 'execute'],
            'permission_callback' => 'novamira_permission_callback',
            'meta'                => [
                'show_in_rest' => true,
                'mcp'          => ['public' => true],
                'annotations'  => [
                    'readonly'    => false,
                    'destructive' => false,
                    'idempotent'  => false,
                ],
            ],
        ]);
    }

    public static function execute($input = null)
    {
        $base64_content = $input['base64_content'];
        $filename       = $input['filename'];
        $title          = $input['title'] ?? null;
        $caption        = $input['caption'] ?? '';
        $alt_text       = $input['alt_text'] ?? '';
        $description    = $input['description'] ?? '';
        $parent_post_id = $input['parent_post_id'] ?? 0;

        // Validate filename has an extension
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if (!$ext) {
            return ['success' => false, 'error' => 'Filename must include a file extension.'];
        }

        // Strip data URL prefix if present (e.g. "data:image/png;base64,")
        if (str_contains($base64_content, ',')) {
            $parts = explode(',', $base64_content, 2);
            if (count($parts) === 2 && str_contains($parts[0], 'base64')) {
                $base64_content = $parts[1];
            }
        }

        // Decode base64
        $file_content = base64_decode($base64_content, true);
        if ($file_content === false) {
            return ['success' => false, 'error' => 'Invalid base64 content — could not decode.'];
        }

        if (strlen($file_content) === 0) {
            return ['success' => false, 'error' => 'Decoded file content is empty.'];
        }

        // Check file size (max 64MB by default, WordPress default)
        $max_bytes = wp_max_upload_size();
        if (strlen($file_content) > $max_bytes) {
            return ['success' => false, 'error' => 'File too large. Max: ' . size_format($max_bytes)];
        }

        // Get MIME type from extension
        $wp_filetype = wp_check_filetype($filename);
        $mime_type   = $wp_filetype['type'];
        if (!$mime_type) {
            return ['success' => false, 'error' => "Unrecognized file extension: .$ext"];
        }

        // Prepare upload
        $upload = wp_upload_bits($filename, null, $file_content);
        if (!empty($upload['error'])) {
            return ['success' => false, 'error' => 'Upload failed: ' . $upload['error']];
        }

        // Prepare attachment data
        $attachment = [
            'post_mime_type' => $mime_type,
            'post_title'     => $title ?: pathinfo($filename, PATHINFO_FILENAME),
            'post_content'   => $description,
            'post_excerpt'   => $caption,
            'post_status'    => 'inherit',
            'post_parent'    => $parent_post_id,
        ];

        // Insert attachment
        $attach_id = wp_insert_attachment($attachment, $upload['file'], $parent_post_id);
        if (is_wp_error($attach_id)) {
            @unlink($upload['file']);
            return ['success' => false, 'error' => 'Failed to create attachment: ' . $attach_id->get_error_message()];
        }

        // Generate attachment metadata (thumbnails, etc.)
        if (!function_exists('wp_generate_attachment_metadata')) {
            require_once ABSPATH . 'wp-admin/includes/image.php';
        }

        $attach_data = wp_generate_attachment_metadata($attach_id, $upload['file']);
        wp_update_attachment_metadata($attach_id, $attach_data);

        // Set alt text for images
        if ($alt_text && str_starts_with($mime_type, 'image/')) {
            update_post_meta($attach_id, '_wp_attachment_image_alt', $alt_text);
        }

        // Get thumbnails
        $thumbnails = [];
        $is_image = str_starts_with($mime_type, 'image/');
        if ($is_image) {
            $sizes = ['thumbnail', 'medium', 'medium_large', 'large', 'full'];
            foreach ($sizes as $size) {
                $src = wp_get_attachment_image_src($attach_id, $size);
                if ($src) {
                    $thumbnails[$size] = [
                        'url'    => $src[0],
                        'width'  => $src[1],
                        'height' => $src[2],
                    ];
                }
            }
        }

        return [
            'success' => true,
            'data'    => [
                'attachment_id'  => $attach_id,
                'url'            => wp_get_attachment_url($attach_id),
                'filename'       => basename($upload['file']),
                'mime_type'      => $mime_type,
                'file_size'      => strlen($file_content),
                'title'          => $attachment['post_title'],
                'edit_url'       => get_edit_post_link($attach_id, 'raw'),
                'thumbnails'     => $thumbnails,
                'is_image'       => $is_image,
            ],
        ];
    }
}

add_action('wp_abilities_api_init', [Media_Upload::class, 'register']);
