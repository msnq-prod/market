-- Align the first video export run schema with the V2 API shape.
-- Production may already have the earlier run/run_items migration applied.

ALTER TABLE `batch_video_export_runs`
    ADD COLUMN IF NOT EXISTS `error_message` TEXT NULL AFTER `export_settings`;

CREATE TABLE IF NOT EXISTS `batch_video_export_items` (
    `id` VARCHAR(191) NOT NULL,
    `run_id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `serial_number` VARCHAR(191) NOT NULL,
    `segment_seq` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'RENDERING', 'RENDERED', 'UPLOADING', 'UPLOADED', 'SKIPPED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `render_status` ENUM('PENDING', 'RENDERING', 'RENDERED', 'UPLOADING', 'UPLOADED', 'SKIPPED', 'FAILED', 'CANCELLED') NULL,
    `upload_status` ENUM('PENDING', 'RENDERING', 'RENDERED', 'UPLOADING', 'UPLOADED', 'SKIPPED', 'FAILED', 'CANCELLED') NULL,
    `file_url` TEXT NULL,
    `checksum` VARCHAR(64) NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `batch_video_export_items_status_idx`(`status`),
    INDEX `batch_video_export_items_item_id_idx`(`item_id`),
    UNIQUE INDEX `batch_video_export_items_run_id_item_id_key`(`run_id`, `item_id`),
    UNIQUE INDEX `batch_video_export_items_run_id_segment_seq_key`(`run_id`, `segment_seq`),
    PRIMARY KEY (`id`),
    CONSTRAINT `batch_video_export_items_run_id_fkey`
        FOREIGN KEY (`run_id`) REFERENCES `batch_video_export_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `batch_video_export_items_item_id_fkey`
        FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `batch_video_export_items` (
    `id`,
    `run_id`,
    `item_id`,
    `serial_number`,
    `segment_seq`,
    `status`,
    `render_status`,
    `upload_status`,
    `file_url`,
    `checksum`,
    `error_message`,
    `created_at`,
    `updated_at`
)
SELECT
    `id`,
    `run_id`,
    `item_id`,
    `serial_number`,
    `segment_seq`,
    CASE `status`
        WHEN 'FAILED_RENDER' THEN 'FAILED'
        WHEN 'FAILED_UPLOAD' THEN 'FAILED'
        ELSE `status`
    END,
    CASE `render_status`
        WHEN 'FAILED_RENDER' THEN 'FAILED'
        WHEN 'FAILED_UPLOAD' THEN 'FAILED'
        ELSE `render_status`
    END,
    CASE `upload_status`
        WHEN 'FAILED_RENDER' THEN 'FAILED'
        WHEN 'FAILED_UPLOAD' THEN 'FAILED'
        ELSE `upload_status`
    END,
    `file_url`,
    LEFT(`checksum`, 64),
    `error_message`,
    `created_at`,
    `updated_at`
FROM `batch_video_export_run_items`
WHERE `item_id` IS NOT NULL;
