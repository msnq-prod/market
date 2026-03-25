-- Alter roles to add sales manager access
ALTER TABLE `users`
    MODIFY `email` VARCHAR(191) NULL,
    MODIFY `role` ENUM('USER', 'ADMIN', 'MANAGER', 'SALES_MANAGER', 'FRANCHISEE') NOT NULL DEFAULT 'USER',
    ADD COLUMN `username` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `users_username_key` ON `users`(`username`);

UPDATE `users`
SET `username` = LOWER(REPLACE(SUBSTRING_INDEX(`email`, '@', 1), ' ', '-'))
WHERE `role` = 'USER'
  AND `username` IS NULL
  AND `email` IS NOT NULL;

-- Expand orders for checkout workflow
ALTER TABLE `orders`
    ADD COLUMN `delivery_address` VARCHAR(191) NULL,
    ADD COLUMN `contact_phone` VARCHAR(191) NULL,
    ADD COLUMN `contact_email` VARCHAR(191) NULL,
    ADD COLUMN `comment` TEXT NULL;

UPDATE `orders`
SET `status` = CASE
    WHEN `status` IN ('DELIVERED', 'PAID') THEN 'COMPLETED'
    WHEN `status` = 'SHIPPED' THEN 'IN_PROGRESS'
    WHEN `status` = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'NEW'
END;

ALTER TABLE `orders`
    MODIFY `status` ENUM('NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'NEW';
