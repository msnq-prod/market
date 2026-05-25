-- CreateTable
CREATE TABLE `batch_video_export_runs` (
    `id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'READY', 'RENDERING', 'UPLOADING', 'PARTIAL', 'FAILED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL,
    `render_manifest` JSON NOT NULL,
    `export_settings` JSON NULL,
    `error_message` TEXT NULL,
    `committed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `batch_video_export_runs_batch_id_created_at_idx`(`batch_id`, `created_at`),
    INDEX `batch_video_export_runs_status_idx`(`status`),
    UNIQUE INDEX `batch_video_export_runs_batch_id_version_key`(`batch_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batch_video_export_items` (
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
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `batch_video_export_runs`
    ADD CONSTRAINT `batch_video_export_runs_batch_id_fkey`
    FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_video_export_runs`
    ADD CONSTRAINT `batch_video_export_runs_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_video_export_items`
    ADD CONSTRAINT `batch_video_export_items_run_id_fkey`
    FOREIGN KEY (`run_id`) REFERENCES `batch_video_export_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_video_export_items`
    ADD CONSTRAINT `batch_video_export_items_item_id_fkey`
    FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
