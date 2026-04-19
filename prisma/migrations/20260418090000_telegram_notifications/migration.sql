ALTER TABLE `users`
    ADD COLUMN `telegram_chat_id` VARCHAR(64) NULL,
    ADD COLUMN `telegram_username` VARCHAR(191) NULL,
    ADD COLUMN `telegram_started_at` DATETIME(3) NULL;

CREATE UNIQUE INDEX `users_telegram_chat_id_key` ON `users`(`telegram_chat_id`);

CREATE TABLE `telegram_bots` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `encrypted_token` TEXT NULL,
    `bot_username` VARCHAR(191) NULL,
    `notify_admin` BOOLEAN NOT NULL DEFAULT false,
    `notify_sales_manager` BOOLEAN NOT NULL DEFAULT false,
    `notify_franchisee` BOOLEAN NOT NULL DEFAULT false,
    `event_settings` JSON NOT NULL,
    `manual_recipients` JSON NOT NULL,
    `low_stock_threshold` INTEGER NOT NULL DEFAULT 10,
    `update_offset` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `telegram_bot_contacts` (
    `id` VARCHAR(191) NOT NULL,
    `bot_id` VARCHAR(191) NOT NULL,
    `chat_id` VARCHAR(64) NOT NULL,
    `chat_type` VARCHAR(32) NOT NULL,
    `username` VARCHAR(191) NULL,
    `first_name` VARCHAR(191) NULL,
    `last_name` VARCHAR(191) NULL,
    `started_at` DATETIME(3) NULL,
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `telegram_bot_contacts_bot_id_chat_id_key`(`bot_id`, `chat_id`),
    INDEX `telegram_bot_contacts_bot_id_last_seen_at_idx`(`bot_id`, `last_seen_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `telegram_notification_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `bot_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `event_key` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `recipient_target` VARCHAR(191) NOT NULL,
    `recipient_kind` VARCHAR(32) NOT NULL,
    `payload` JSON NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_error` TEXT NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `telegram_notification_jobs_bot_id_created_at_idx`(`bot_id`, `created_at`),
    INDEX `telegram_notification_jobs_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    INDEX `telegram_notification_jobs_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `telegram_low_stock_states` (
    `id` VARCHAR(191) NOT NULL,
    `bot_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `last_known_free_stock` INTEGER NOT NULL DEFAULT 0,
    `below_threshold` BOOLEAN NOT NULL DEFAULT false,
    `last_notified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `telegram_low_stock_states_bot_id_product_id_key`(`bot_id`, `product_id`),
    INDEX `telegram_low_stock_states_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `telegram_bot_contacts`
    ADD CONSTRAINT `telegram_bot_contacts_bot_id_fkey`
    FOREIGN KEY (`bot_id`) REFERENCES `telegram_bots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `telegram_notification_jobs`
    ADD CONSTRAINT `telegram_notification_jobs_bot_id_fkey`
    FOREIGN KEY (`bot_id`) REFERENCES `telegram_bots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `telegram_notification_jobs`
    ADD CONSTRAINT `telegram_notification_jobs_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `telegram_low_stock_states`
    ADD CONSTRAINT `telegram_low_stock_states_bot_id_fkey`
    FOREIGN KEY (`bot_id`) REFERENCES `telegram_bots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `telegram_low_stock_states`
    ADD CONSTRAINT `telegram_low_stock_states_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
