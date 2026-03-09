-- CreateTable
CREATE TABLE `collection_requests` (
    `id` VARCHAR(191) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `target_user_id` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NULL,
    `requested_qty` INTEGER NOT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `collection_requests_created_by_idx`(`created_by`),
    INDEX `collection_requests_target_user_id_idx`(`target_user_id`),
    INDEX `collection_requests_status_idx`(`status`),
    INDEX `collection_requests_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `collection_requests`
    ADD CONSTRAINT `collection_requests_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_requests`
    ADD CONSTRAINT `collection_requests_target_user_id_fkey`
    FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
