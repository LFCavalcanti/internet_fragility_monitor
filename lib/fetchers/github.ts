import { StatusPageFetcher } from "./statuspage";

/** GitHub usa a Statuspage.io; o leitor é o da família. */
export class GitHubFetcher extends StatusPageFetcher {
    constructor() {
        super("github", "https://www.githubstatus.com");
    }
}
