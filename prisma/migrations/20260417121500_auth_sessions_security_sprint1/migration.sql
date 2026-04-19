ALTER TABLE `audit_logs`
    MODIFY `user_id` VARCHAR(191) NULL;

CREATE TABLE `auth_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `family_id` VARCHAR(191) NOT NULL,
    `parent_session_id` VARCHAR(191) NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `user_agent` VARCHAR(191) NULL,
    `ip_address` VARCHAR(64) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `last_used_at` DATETIME(3) NULL,
    `rotated_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoke_reason` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auth_sessions_token_hash_key`(`token_hash`),
    INDEX `auth_sessions_user_id_idx`(`user_id`),
    INDEX `auth_sessions_family_id_idx`(`family_id`),
    INDEX `auth_sessions_expires_at_idx`(`expires_at`),
    INDEX `auth_sessions_revoked_at_idx`(`revoked_at`),
    INDEX `auth_sessions_parent_session_id_idx`(`parent_session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `auth_sessions`
    ADD CONSTRAINT `auth_sessions_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `auth_sessions`
    ADD CONSTRAINT `auth_sessions_parent_session_id_fkey`
    FOREIGN KEY (`parent_session_id`) REFERENCES `auth_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
