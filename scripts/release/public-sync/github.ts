/** Public repository the sync writes to. */
export const PUBLIC_REPO = "morpho-org/sdks";
/** Head branch of the sync PR. */
export const SYNC_BRANCH = "sync/main";
/** REST path listing the open sync PRs on the public repository. */
export const OPEN_SYNC_PRS_PATH = `repos/${PUBLIC_REPO}/pulls?state=open&base=main&head=${PUBLIC_REPO.split("/")[0]}:${SYNC_BRANCH}`;

/** Failed GitHub API call. Carries the status so callers can treat a 404 as "missing". */
export class GitHubApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

/** The two GitHub API calls the sync makes; tests replace it with an in-memory fake. */
export interface GitHub {
  /** REST call relative to `https://api.github.com/` (`GET` by default). Throws {@link GitHubApiError} on a non-2xx status. */
  rest(
    path: string,
    init?: { readonly method?: string; readonly body?: unknown },
  ): Promise<unknown>;
  /** GraphQL call. Throws when the response carries `errors`. */
  graphql(query: string, variables: Record<string, unknown>): Promise<unknown>;
}

/** Injectable `fetch` boundary. */
export type FetchLike = (
  url: URL,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Builds a {@link GitHub} client over `fetch`. The token only goes into the
 * `Authorization` header: error messages name the method, path and status, never it.
 *
 * @param options.token - Installation token.
 * @param options.fetchImpl - `fetch` replacement for tests.
 * @returns The client.
 */
export function createGitHub(options: {
  readonly token: string;
  readonly fetchImpl?: FetchLike;
}): GitHub {
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const call: GitHub["rest"] = async (path, init = {}) => {
    const { method = "GET", body } = init;
    const response = await fetchImpl(new URL(path, "https://api.github.com/"), {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "User-Agent": "morpho-sdks-public-sync",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = "";
      try {
        const parsed: unknown = JSON.parse(text);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "message" in parsed &&
          typeof parsed.message === "string"
        ) {
          detail = `: ${parsed.message}`;
        }
      } catch {
        // A non-JSON error body adds nothing the status doesn't say.
      }
      throw new GitHubApiError(
        `GitHub API ${method} /${path} failed with ${response.status}${detail}.`,
        response.status,
      );
    }
    return text === "" ? undefined : (JSON.parse(text) as unknown);
  };
  return {
    rest: call,
    async graphql(query, variables) {
      const result = await call("graphql", {
        method: "POST",
        body: { query, variables },
      });
      if (typeof result !== "object" || result === null) {
        throw new Error("GitHub GraphQL returned no payload.");
      }
      if ("errors" in result && Array.isArray(result.errors)) {
        const messages = result.errors.map((error: unknown) =>
          typeof error === "object" && error !== null && "message" in error
            ? String(error.message)
            : JSON.stringify(error),
        );
        throw new Error(`GitHub GraphQL failed: ${messages.join("; ")}`);
      }
      return "data" in result ? result.data : undefined;
    },
  };
}
