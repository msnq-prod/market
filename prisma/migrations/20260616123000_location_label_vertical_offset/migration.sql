ALTER TABLE `locations`
    ADD COLUMN `label_desktop_vertical_offset` INTEGER NOT NULL DEFAULT 16,
    ADD COLUMN `label_mobile_vertical_offset` INTEGER NOT NULL DEFAULT 16;
