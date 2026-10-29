import { StatusPageFetcher } from "./statuspage";

/** Cloudflare usa a Statuspage.io; o leitor é o da família. */
export class CloudflareFetcher extends StatusPageFetcher {
    constructor() {
        super("cloudflare", "https://www.cloudflarestatus.com");
    }
}
