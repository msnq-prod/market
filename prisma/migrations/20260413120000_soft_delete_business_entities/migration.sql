-- Add soft delete support for catalog and operational business entities.
ALTER TABLE `locations`
    ADD COLUMN `deleted_at` DATETIME(3) NULL;

ALTER TABLE `products`
    ADD COLUMN `deleted_at` DATETIME(3) NULL;

ALTER TABLE `orders`
    ADD COLUMN `deleted_at` DATETIME(3) NULL;

ALTER TABLE `batches`
    ADD COLUMN `deleted_at` DATETIME(3) NULL;

ALTER TABLE `items`
    ADD COLUMN `deleted_at` DATETIME(3) NULL;

ALTER TABLE `collection_requests`
    ADD COLUMN `deleted_at` DATETIME(3) NULL;

CREATE INDEX `locations_deleted_at_idx` ON `locations`(`deleted_at`);
CREATE INDEX `products_deleted_at_idx` ON `products`(`deleted_at`);
CREATE INDEX `orders_deleted_at_idx` ON `orders`(`deleted_at`);
CREATE INDEX `batches_deleted_at_idx` ON `batches`(`deleted_at`);
CREATE INDEX `items_deleted_at_idx` ON `items`(`deleted_at`);
CREATE INDEX `collection_requests_deleted_at_idx` ON `collection_requests`(`deleted_at`);
