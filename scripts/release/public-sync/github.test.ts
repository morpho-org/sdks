import { describe, expect, test } from "vitest";

import { createGitHub, type FetchLike, GitHubApiError } from "./github.ts";

const TOKEN = "ghs_secretTokenValue";

function respond(status: number, text: string) {
  const requests: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url: url.toString(), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    };
  };
  return { github: createGitHub({ token: TOKEN, fetchImpl }), requests };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("createGitHub", () => {
  test("sends the token only in the Authorization header and parses JSON", async () => {
    const { github, requests } = respond(200, '{"a":1}');
    await expect(
      github.rest("repos/o/r/pulls", { method: "POST", body: { x: 1 } }),
    ).resolves.toEqual({ a: 1 });
    expect(requests).toEqual([
      {
        url: "https://api.github.com/repos/o/r/pulls",
        init: expect.objectContaining({ method: "POST", body: '{"x":1}' }),
      },
    ]);
    expect(requests[0]?.init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  test("returns undefined for an empty 204 body", async () => {
    const { github } = respond(204, "");
    await expect(
      github.rest("repos/o/r/git/refs/heads/x", { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });

  test("turns a JSON error into a GitHubApiError with its status and message", async () => {
    const { github } = respond(404, '{"message":"Not Found"}');
    const error = await failure(github.rest("repos/o/r/git/ref/heads/main"));
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({
      status: 404,
      message:
        "GitHub API GET /repos/o/r/git/ref/heads/main failed with 404: Not Found.",
    });
    expect(String(error)).not.toContain(TOKEN);
  });

  test("keeps a non-JSON error to its status", async () => {
    const { github } = respond(502, "<html>Bad gateway</html>");
    const error = await failure(github.rest("repos/o/r"));
    expect(error).toMatchObject({
      status: 502,
      message: "GitHub API GET /repos/o/r failed with 502.",
    });
  });

  test("returns GraphQL data", async () => {
    const { github, requests } = respond(200, '{"data":{"node":{"id":"x"}}}');
    await expect(
      github.graphql("query { node }", { id: "x" }),
    ).resolves.toEqual({
      node: { id: "x" },
    });
    expect(requests[0]?.url).toBe("https://api.github.com/graphql");
    expect(JSON.parse(requests[0]?.init.body ?? "")).toEqual({
      query: "query { node }",
      variables: { id: "x" },
    });
  });

  test("throws on a GraphQL error payload, without the token", async () => {
    const { github } = respond(
      200,
      '{"errors":[{"message":"Pull request is in clean status"},{"type":"X"}]}',
    );
    const error = await failure(github.graphql("mutation", {}));
    expect(String(error)).toBe(
      'Error: GitHub GraphQL failed: Pull request is in clean status; {"type":"X"}',
    );
    expect(String(error)).not.toContain(TOKEN);
  });

  test("throws on an empty GraphQL payload", async () => {
    const { github } = respond(200, "");
    await expect(github.graphql("query", {})).rejects.toThrow("no payload");
  });
});
