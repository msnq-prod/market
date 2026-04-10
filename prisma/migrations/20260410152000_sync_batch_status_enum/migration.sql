ALTER TABLE `batches`
    MODIFY `status` ENUM(
        'OPEN',
        'IN_PROGRESS',
        'IN_TRANSIT',
        'RECEIVED',
        'IN_STOCK',
        'CANCELLED',
        'DRAFT',
        'TRANSIT',
        'ERROR',
        'FINISHED'
    ) NOT NULL DEFAULT 'IN_PROGRESS';

UPDATE `batches`
SET `status` = 'DRAFT'
WHERE `status` IN ('OPEN', 'IN_PROGRESS');

UPDATE `batches`
SET `status` = 'TRANSIT'
WHERE `status` = 'IN_TRANSIT';

UPDATE `batches`
SET `status` = 'FINISHED'
WHERE `status` = 'IN_STOCK';

UPDATE `batches`
SET `status` = 'ERROR'
WHERE `status` = 'CANCELLED';

ALTER TABLE `batches`
    MODIFY `status` ENUM(
        'DRAFT',
        'TRANSIT',
        'RECEIVED',
        'ERROR',
        'FINISHED'
    ) NOT NULL DEFAULT 'DRAFT';
