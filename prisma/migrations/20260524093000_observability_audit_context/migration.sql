ALTER TABLE `audit_logs`
    ADD COLUMN `request_id` VARCHAR(191) NULL,
    ADD COLUMN `entity_type` VARCHAR(191) NULL,
    ADD COLUMN `entity_id` VARCHAR(191) NULL,
    ADD COLUMN `actor_role` VARCHAR(191) NULL;

CREATE INDEX `audit_logs_request_id_idx` ON `audit_logs`(`request_id`);
CREATE INDEX `audit_logs_entity_type_entity_id_idx` ON `audit_logs`(`entity_type`, `entity_id`);
