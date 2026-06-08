-- CreateTable
CREATE TABLE `photo_tool_runs` (
    `id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('OPEN', 'UPLOADING', 'READY_TO_COMMIT', 'COMMITTING', 'COMPLETED', 'FAILED', 'STALE', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `expected_count` INTEGER NOT NULL,
    `uploaded_count` INTEGER NOT NULL DEFAULT 0,
    `base_photo_state_token` VARCHAR(64) NOT NULL,
    `photo_export_settings` JSON NOT NULL,
    `manifest` JSON NOT NULL,
    `error_message` TEXT NULL,
    `committed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `photo_tool_runs_batch_id_created_at_idx`(`batch_id`, `created_at`),
    INDEX `photo_tool_runs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `photo_tool_run_items` (
    `id` VARCHAR(191) NOT NULL,
    `run_id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `item_seq` INTEGER NOT NULL,
    `source_type` ENUM('EXISTING', 'UPLOAD') NOT NULL,
    `status` ENUM('PENDING', 'REUSED', 'UPLOADING', 'UPLOADED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `file_url` TEXT NULL,
    `existing_url` TEXT NULL,
    `checksum_sha256` VARCHAR(64) NULL,
    `file_size_bytes` INTEGER NULL,
    `error_message` TEXT NULL,
    `uploaded_at` DATETIME(3) NULL,
    `committed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `photo_tool_run_items_item_id_idx`(`item_id`),
    INDEX `photo_tool_run_items_status_idx`(`status`),
    UNIQUE INDEX `photo_tool_run_items_run_id_item_id_key`(`run_id`, `item_id`),
    UNIQUE INDEX `photo_tool_run_items_run_id_item_seq_key`(`run_id`, `item_seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `photo_tool_runs` ADD CONSTRAINT `photo_tool_runs_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `photo_tool_runs` ADD CONSTRAINT `photo_tool_runs_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `photo_tool_run_items` ADD CONSTRAINT `photo_tool_run_items_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `photo_tool_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `photo_tool_run_items` ADD CONSTRAINT `photo_tool_run_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
