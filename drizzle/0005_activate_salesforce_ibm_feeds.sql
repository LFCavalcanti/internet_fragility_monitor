-- Ativa os Feeds de Salesforce e IBM (spec-status-feed.md, Ticket 11): os leitores das famílias existem agora.
-- As URLs da carga (0004) foram conferidas contra os Feeds reais em 31/10/2026 e continuam valendo.
-- Com um Feed ativo, os dois Providers perdem a marca de "só acesso" (`isAccessOnly`).
UPDATE `provider_sources` SET `active` = 1 WHERE `id` IN ('salesforce-feed', 'ibm-cloud-feed');
