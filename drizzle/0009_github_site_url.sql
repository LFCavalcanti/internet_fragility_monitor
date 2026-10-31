-- Corrige o site do GitHub no catálogo (spec-post-cycle-cleanup.md, Ticket 21): a carga (0004) gravou a status page nele.
-- A status page do Provider e os Provider Sources não mudam.
UPDATE `providers` SET `url` = 'https://github.com' WHERE `id` = 'github';
