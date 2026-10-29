-- Incidents gravados com o antigo status "maintenance" passam a ser do tipo manutenção, na fase completed.
-- O Poll seguinte atualiza (fase e data marcada) os que continuam no Feed.
UPDATE `incidents`
SET `kind` = 'maintenance',
    `status` = 'completed',
    `resolved_at` = COALESCE(`resolved_at`, CAST(strftime('%s', 'now') AS integer))
WHERE `status` = 'maintenance';
