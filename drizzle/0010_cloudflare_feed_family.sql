-- A Cloudflare ganha família de Feed própria (spec-declared-severity.md, Ticket 25): o estado dela deixa de seguir o
-- indicador geral. A URL do Feed e os outros Providers da família Statuspage.io não mudam.
UPDATE `provider_sources` SET `family` = 'cloudflare' WHERE `id` = 'cloudflare-feed';
