-- CreateTable
CREATE TABLE `video_processing_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NOT NULL,
    `requested_by_user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('UPLOADED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'UPLOADED',
    `version` INTEGER NOT NULL,
    `source_count` INTEGER NOT NULL,
    `output_count` INTEGER NOT NULL,
    `processed_output_count` INTEGER NOT NULL DEFAULT 0,
    `base_clip_name` VARCHAR(255) NOT NULL,
    `source_manifest` JSON NOT NULL,
    `result_manifest` JSON NULL,
    `error_message` TEXT NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `video_processing_jobs_batch_id_created_at_idx`(`batch_id`, `created_at`),
    INDEX `video_processing_jobs_status_idx`(`status`),
    UNIQUE INDEX `video_processing_jobs_batch_id_version_key`(`batch_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `video_processing_jobs` ADD CONSTRAINT `video_processing_jobs_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_processing_jobs` ADD CONSTRAINT `video_processing_jobs_requested_by_user_id_fkey` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
