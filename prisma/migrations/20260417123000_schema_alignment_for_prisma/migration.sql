ALTER TABLE `audit_logs` DROP FOREIGN KEY `audit_logs_user_id_fkey`;

ALTER TABLE `audit_logs`
    ADD CONSTRAINT `audit_logs_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `order_shipments`
    MODIFY `updated_at` DATETIME(3) NOT NULL;
