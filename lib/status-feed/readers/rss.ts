import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { feedDate } from "./feed-date";

/** Texto fica texto: um título só com dígitos não vira número. `item` e `category` são sempre listas, mesmo com um só. */
const parser = new XMLParser({ parseTagValue: false, isArray: name => name === "item" || name === "category" });

const rssSchema = z.object({
    rss: z.object({
        channel: z.object({
            item: z
                .array(
                    z.object({
                        title: z.string().min(1),
                        pubDate: feedDate,
                        guid: z.string().optional(),
                        link: z.string().optional(),
                        description: z.string().optional(),
                        category: z.array(z.string()).default([]),
                    }),
                )
                .default([]),
        }),
    }),
});

export type RssItem = z.output<typeof rssSchema>["rss"]["channel"]["item"][number];

/** Os itens de um RSS 2.0. Lança quando o conteúdo não é um RSS no formato esperado. */
export function parseRssItems(body: string): RssItem[] {
    return rssSchema.parse(parser.parse(body)).rss.channel.item;
}
