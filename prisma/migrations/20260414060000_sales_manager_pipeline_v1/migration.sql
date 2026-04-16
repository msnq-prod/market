ALTER TABLE `orders`
    ADD COLUMN `assigned_sales_manager_id` VARCHAR(191) NULL,
    ADD COLUMN `return_reason` ENUM('REFUSED_BY_CUSTOMER', 'NOT_PICKED_UP') NULL;

ALTER TABLE `orders`
    MODIFY `status` ENUM(
        'NEW',
        'IN_PROGRESS',
        'COMPLETED',
        'PACKED',
        'SHIPPED',
        'RECEIVED',
        'RETURN_REQUESTED',
        'RETURN_IN_TRANSIT',
        'RETURNED',
        'CANCELLED'
    ) NOT NULL DEFAULT 'NEW';

UPDATE `orders`
SET `status` = CASE
    WHEN `status` = 'COMPLETED' THEN 'RECEIVED'
    WHEN `status` = 'IN_PROGRESS' THEN 'IN_PROGRESS'
    WHEN `status` = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'NEW'
END;

ALTER TABLE `orders`
    MODIFY `status` ENUM(
        'NEW',
        'IN_PROGRESS',
        'PACKED',
        'SHIPPED',
        'RECEIVED',
        'RETURN_REQUESTED',
        'RETURN_IN_TRANSIT',
        'RETURNED',
        'CANCELLED'
    ) NOT NULL DEFAULT 'NEW';

CREATE INDEX `orders_assigned_sales_manager_id_idx` ON `orders`(`assigned_sales_manager_id`);

CREATE TABLE `order_status_events` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `from_status` ENUM(
        'NEW',
        'IN_PROGRESS',
        'PACKED',
        'SHIPPED',
        'RECEIVED',
        'RETURN_REQUESTED',
        'RETURN_IN_TRANSIT',
        'RETURNED',
        'CANCELLED'
    ) NULL,
    `to_status` ENUM(
        'NEW',
        'IN_PROGRESS',
        'PACKED',
        'SHIPPED',
        'RECEIVED',
        'RETURN_REQUESTED',
        'RETURN_IN_TRANSIT',
        'RETURNED',
        'CANCELLED'
    ) NOT NULL,
    `meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_status_events_order_id_created_at_idx`(`order_id`, `created_at`),
    INDEX `order_status_events_actor_user_id_idx`(`actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_item_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `order_item_id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `order_item_assignments_item_id_key`(`item_id`),
    INDEX `order_item_assignments_order_item_id_idx`(`order_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_shipments` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `carrier` VARCHAR(32) NOT NULL DEFAULT 'CDEK',
    `tracking_number` VARCHAR(64) NOT NULL,
    `tracking_status_code` VARCHAR(64) NULL,
    `tracking_status_label` VARCHAR(191) NULL,
    `last_event_at` DATETIME(3) NULL,
    `last_synced_at` DATETIME(3) NULL,
    `meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `order_shipments_order_id_key`(`order_id`),
    INDEX `order_shipments_tracking_number_idx`(`tracking_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `order_status_events` (`id`, `order_id`, `actor_user_id`, `from_status`, `to_status`, `meta`, `created_at`)
SELECT UUID(), `id`, NULL, NULL, `status`, NULL, `created_at`
FROM `orders`;

ALTER TABLE `orders`
    ADD CONSTRAINT `orders_assigned_sales_manager_id_fkey`
    FOREIGN KEY (`assigned_sales_manager_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `order_status_events`
    ADD CONSTRAINT `order_status_events_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `order_status_events`
    ADD CONSTRAINT `order_status_events_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `order_item_assignments`
    ADD CONSTRAINT `order_item_assignments_order_item_id_fkey`
    FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `order_item_assignments`
    ADD CONSTRAINT `order_item_assignments_item_id_fkey`
    FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `order_shipments`
    ADD CONSTRAINT `order_shipments_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
