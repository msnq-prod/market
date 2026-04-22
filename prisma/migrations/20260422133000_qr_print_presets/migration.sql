CREATE TABLE `qr_print_presets` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `settings` JSON NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `updated_by_user_id` VARCHAR(191) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `qr_print_presets_deleted_at_idx`(`deleted_at`),
    INDEX `qr_print_presets_name_idx`(`name`),
    INDEX `qr_print_presets_updated_at_idx`(`updated_at`),
    INDEX `qr_print_presets_created_by_user_id_idx`(`created_by_user_id`),
    INDEX `qr_print_presets_updated_by_user_id_idx`(`updated_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `qr_print_presets`
    ADD CONSTRAINT `qr_print_presets_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `qr_print_presets`
    ADD CONSTRAINT `qr_print_presets_updated_by_user_id_fkey`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
