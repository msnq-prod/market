-- CreateTable
CREATE TABLE `video_tool_v3_runs` (
    `id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('OPEN', 'PARTIAL', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `expected_count` INTEGER NOT NULL,
    `uploaded_count` INTEGER NOT NULL DEFAULT 0,
    `replace_existing` BOOLEAN NOT NULL DEFAULT false,
    `manifest` JSON NOT NULL,
    `error_message` TEXT NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `video_tool_v3_runs_batch_id_created_at_idx`(`batch_id`, `created_at`),
    INDEX `video_tool_v3_runs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_tool_v3_items` (
    `id` VARCHAR(191) NOT NULL,
    `run_id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `serial_number` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'UPLOADING', 'UPLOADED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `file_url` TEXT NULL,
    `checksum_sha256` VARCHAR(64) NULL,
    `file_size_bytes` INTEGER NULL,
    `error_message` TEXT NULL,
    `uploaded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `video_tool_v3_items_item_id_idx`(`item_id`),
    INDEX `video_tool_v3_items_status_idx`(`status`),
    UNIQUE INDEX `video_tool_v3_items_run_id_item_id_key`(`run_id`, `item_id`),
    UNIQUE INDEX `video_tool_v3_items_run_id_serial_number_key`(`run_id`, `serial_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `video_tool_v3_runs` ADD CONSTRAINT `video_tool_v3_runs_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_tool_v3_runs` ADD CONSTRAINT `video_tool_v3_runs_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_tool_v3_items` ADD CONSTRAINT `video_tool_v3_items_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `video_tool_v3_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_tool_v3_items` ADD CONSTRAINT `video_tool_v3_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

