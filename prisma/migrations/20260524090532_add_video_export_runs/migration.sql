-- CreateTable
CREATE TABLE `batch_video_export_runs` (
    `id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'READY', 'RENDERING', 'UPLOADING', 'PARTIAL', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL,
    `render_manifest` JSON NOT NULL,
    `export_settings` JSON NULL,
    `committed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `batch_video_export_runs_batch_id_created_at_idx`(`batch_id`, `created_at`),
    INDEX `batch_video_export_runs_status_idx`(`status`),
    UNIQUE INDEX `batch_video_export_runs_batch_id_version_key`(`batch_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batch_video_export_run_items` (
    `id` VARCHAR(191) NOT NULL,
    `run_id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NULL,
    `serial_number` VARCHAR(191) NOT NULL,
    `segment_seq` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'RENDERING', 'RENDERED', 'UPLOADING', 'UPLOADED', 'FAILED_RENDER', 'FAILED_UPLOAD', 'CANCELLED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `render_status` VARCHAR(191) NULL,
    `upload_status` VARCHAR(191) NULL,
    `file_url` VARCHAR(191) NULL,
    `error_message` TEXT NULL,
    `checksum` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `batch_video_export_run_items_run_id_idx`(`run_id`),
    INDEX `batch_video_export_run_items_item_id_idx`(`item_id`),
    UNIQUE INDEX `batch_video_export_run_items_run_id_serial_number_key`(`run_id`, `serial_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `batch_video_export_runs` ADD CONSTRAINT `batch_video_export_runs_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_video_export_runs` ADD CONSTRAINT `batch_video_export_runs_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_video_export_run_items` ADD CONSTRAINT `batch_video_export_run_items_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `batch_video_export_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_video_export_run_items` ADD CONSTRAINT `batch_video_export_run_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
