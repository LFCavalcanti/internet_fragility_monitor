import { StatusPageFetcher } from "./statuspage";

/** Vercel usa a Statuspage.io; o leitor é o da família. */
export class VercelFetcher extends StatusPageFetcher {
    constructor() {
        super("vercel", "https://www.vercel-status.com");
    }
}
