UPDATE `items` AS `i`
JOIN `batches` AS `b` ON `b`.`id` = `i`.`batch_id`
LEFT JOIN `products` AS `p` ON `p`.`id` = COALESCE(`i`.`product_id`, `b`.`product_id`)
SET `i`.`serial_number` = CONCAT(
    CASE
        WHEN COALESCE(`b`.`daily_batch_seq`, 1) > 1 THEN CAST(COALESCE(`b`.`daily_batch_seq`, 1) AS CHAR)
        ELSE ''
    END,
    UPPER(SUBSTRING(COALESCE(NULLIF(TRIM(`p`.`country_code`), ''), 'RUS'), 1, 3)),
    UPPER(SUBSTRING(COALESCE(NULLIF(TRIM(`p`.`location_code`), ''), 'LOC'), 1, 3)),
    UPPER(SUBSTRING(COALESCE(NULLIF(TRIM(`p`.`item_code`), ''), '00'), 1, 8)),
    DATE_FORMAT(COALESCE(`b`.`collected_date`, `i`.`collected_date`), '%d%m%y'),
    LPAD(`i`.`item_seq`, 3, '0')
)
WHERE `i`.`serial_number` IS NULL
  AND `p`.`id` IS NOT NULL
  AND COALESCE(`b`.`collected_date`, `i`.`collected_date`) IS NOT NULL
  AND `i`.`item_seq` IS NOT NULL;

ALTER TABLE `items`
  DROP INDEX `items_public_token_idx`,
  DROP INDEX `items_public_token_key`,
  DROP COLUMN `public_token`;
