import { z } from "zod";

/** Data publicada por um Feed. Uma data inválida é conteúdo fora do formato: o Feed fica não lido. */
export const feedDate = z.string().pipe(z.coerce.date());
