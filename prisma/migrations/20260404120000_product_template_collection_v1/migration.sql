-- Alter batches: add new links and transition legacy statuses safely.
ALTER TABLE `batches`
    ADD COLUMN `collected_date` DATETIME(3) NULL,
    ADD COLUMN `collected_time` VARCHAR(5) NULL,
    ADD COLUMN `collection_request_id` VARCHAR(191) NULL,
    ADD COLUMN `daily_batch_seq` INTEGER NULL,
    ADD COLUMN `product_id` VARCHAR(191) NULL,
    MODIFY `status` ENUM('DRAFT', 'TRANSIT', 'RECEIVED', 'ERROR', 'FINISHED', 'OPEN', 'IN_PROGRESS', 'IN_TRANSIT', 'IN_STOCK', 'CANCELLED') NOT NULL DEFAULT 'DRAFT';

UPDATE `batches` SET `status` = 'IN_PROGRESS' WHERE `status` = 'DRAFT';
UPDATE `batches` SET `status` = 'IN_TRANSIT' WHERE `status` = 'TRANSIT';
UPDATE `batches` SET `status` = 'IN_STOCK' WHERE `status` = 'FINISHED';
UPDATE `batches` SET `status` = 'CANCELLED' WHERE `status` = 'ERROR';

ALTER TABLE `batches`
    MODIFY `status` ENUM('OPEN', 'IN_PROGRESS', 'IN_TRANSIT', 'RECEIVED', 'IN_STOCK', 'CANCELLED') NOT NULL DEFAULT 'IN_PROGRESS';

-- Alter collection requests: keep historical rows and map the closed status.
ALTER TABLE `collection_requests`
    ADD COLUMN `accepted_at` DATETIME(3) NULL,
    ADD COLUMN `accepted_by` VARCHAR(191) NULL,
    ADD COLUMN `product_id` VARCHAR(191) NULL,
    MODIFY `status` ENUM('OPEN', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED', 'IN_TRANSIT', 'RECEIVED', 'IN_STOCK') NOT NULL DEFAULT 'OPEN';

UPDATE `collection_requests` SET `status` = 'IN_STOCK' WHERE `status` = 'FULFILLED';

ALTER TABLE `collection_requests`
    MODIFY `status` ENUM('OPEN', 'IN_PROGRESS', 'IN_TRANSIT', 'RECEIVED', 'IN_STOCK', 'CANCELLED') NOT NULL DEFAULT 'OPEN';

-- Extend items with generated serial numbers and final media payload.
ALTER TABLE `items`
    ADD COLUMN `collected_date` DATETIME(3) NULL,
    ADD COLUMN `collected_time` VARCHAR(5) NULL,
    ADD COLUMN `is_sold` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `item_photo_url` VARCHAR(191) NULL,
    ADD COLUMN `item_seq` INTEGER NULL,
    ADD COLUMN `item_video_url` VARCHAR(191) NULL,
    ADD COLUMN `product_id` VARCHAR(191) NULL,
    ADD COLUMN `serial_number` VARCHAR(191) NULL,
    MODIFY `photo_url` VARCHAR(191) NULL;

-- Product template fields for public availability and serial number prefixes.
ALTER TABLE `products`
    ADD COLUMN `country_code` VARCHAR(3) NOT NULL DEFAULT 'RUS',
    ADD COLUMN `is_published` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `item_code` VARCHAR(8) NOT NULL DEFAULT '00',
    ADD COLUMN `location_code` VARCHAR(3) NOT NULL DEFAULT 'LOC',
    ADD COLUMN `location_description` TEXT NULL;

ALTER TABLE `orders`
    MODIFY `comment` VARCHAR(191) NULL,
    MODIFY `internal_note` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `batches_collection_request_id_key` ON `batches`(`collection_request_id`);
CREATE INDEX `batches_product_id_idx` ON `batches`(`product_id`);
CREATE INDEX `batches_status_idx` ON `batches`(`status`);
CREATE INDEX `collection_requests_accepted_by_idx` ON `collection_requests`(`accepted_by`);
CREATE INDEX `collection_requests_product_id_idx` ON `collection_requests`(`product_id`);
CREATE UNIQUE INDEX `items_serial_number_key` ON `items`(`serial_number`);
CREATE INDEX `items_product_id_idx` ON `items`(`product_id`);
CREATE INDEX `items_status_is_sold_idx` ON `items`(`status`, `is_sold`);
CREATE INDEX `products_is_published_idx` ON `products`(`is_published`);

ALTER TABLE `batches`
    ADD CONSTRAINT `batches_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `batches_collection_request_id_fkey` FOREIGN KEY (`collection_request_id`) REFERENCES `collection_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `items`
    ADD CONSTRAINT `items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `collection_requests`
    ADD CONSTRAINT `collection_requests_accepted_by_fkey` FOREIGN KEY (`accepted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `collection_requests_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
