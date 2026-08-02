ALTER TABLE `locations`
    ADD COLUMN `label_desktop_offset` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `label_desktop_direction` VARCHAR(8) NOT NULL DEFAULT 'UP',
    ADD COLUMN `label_mobile_offset` INTEGER NOT NULL DEFAULT 80,
    ADD COLUMN `label_mobile_direction` VARCHAR(8) NOT NULL DEFAULT 'UP';
