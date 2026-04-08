-- CreateTable
CREATE TABLE `batch_video_export_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('OPEN', 'UPLOADING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'OPEN',
    `version` INTEGER NOT NULL,
    `expected_count` INTEGER NOT NULL,
    `uploaded_count` INTEGER NOT NULL DEFAULT 0,
    `crossfade_ms` INTEGER NOT NULL,
    `source_fingerprint` JSON NULL,
    `render_manifest` JSON NULL,
    `uploaded_manifest` JSON NULL,
    `error_message` TEXT NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `batch_video_export_sessions_batch_id_created_at_idx`(`batch_id`, `created_at`),
    INDEX `batch_video_export_sessions_status_idx`(`status`),
    UNIQUE INDEX `batch_video_export_sessions_batch_id_version_key`(`batch_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `batch_video_export_sessions` ADD CONSTRAINT `batch_video_export_sessions_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_video_export_sessions` ADD CONSTRAINT `batch_video_export_sessions_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
