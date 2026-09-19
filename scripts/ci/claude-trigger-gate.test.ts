import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  authorize,
  type FetchLike,
  fetchPermission,
  hasWriteAccess,
  main,
  normalizeBotLogin,
  parseAllowedBots,
} from "./claude-trigger-gate.ts";

const REPO = "morpho-org/sdks";
const BOTS = "morpho-apps-git-bot,devin-ai-integration,cursor";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { force: true, recursive: true });
});

/** Stubs the permission endpoint and records how many times it was called. */
function permissionFetch(
  response: { permission?: unknown } | number,
): FetchLike & { calls: URL[] } {
  const calls: URL[] = [];
  const impl: FetchLike = (url) => {
    calls.push(url);
    if (typeof response === "number") {
      return Promise.resolve({
        json: () => Promise.resolve(null),
        ok: false,
        status: response,
      });
    }

    return Promise.resolve({
      json: () => Promise.resolve(response),
      ok: true,
      status: 200,
    });
  };

  return Object.assign(impl, { calls });
}

function humanEnv(association: string, login = "alice"): NodeJS.ProcessEnv {
  return {
    ALLOWED_BOTS: BOTS,
    AUTHOR_ASSOCIATION: association,
    EVENT_NAME: "issue_comment",
    GH_TOKEN: "t",
    GITHUB_REPOSITORY: REPO,
    SENDER_LOGIN: login,
    SENDER_TYPE: "User",
  };
}

describe("parseAllowedBots", () => {
  test("default", () => {
    expect(parseAllowedBots("a,b,c")).toEqual(["a", "b", "c"]);
  });

  test("behavior: trims, folds case, strips [bot], drops blanks", () => {
    expect(parseAllowedBots(" Cursor , ,devin-ai-integration[bot], ")).toEqual([
      "cursor",
      "devin-ai-integration",
    ]);
  });

  test("behavior: an unset or empty list authorizes no bot", () => {
    expect(parseAllowedBots(undefined)).toEqual([]);
    expect(parseAllowedBots("")).toEqual([]);
    expect(parseAllowedBots(" , , ")).toEqual([]);
  });
});

describe("normalizeBotLogin", () => {
  test("default", () => {
    expect(normalizeBotLogin("Devin-AI-Integration[bot]")).toBe(
      "devin-ai-integration",
    );
  });

  test("behavior: only a trailing [bot] is stripped", () => {
    expect(normalizeBotLogin("a[bot]b")).toBe("a[bot]b");
  });
});

describe("hasWriteAccess", () => {
  test("default", () => {
    expect(hasWriteAccess("write")).toBe(true);
    expect(hasWriteAccess("admin")).toBe(true);
    expect(hasWriteAccess("maintain")).toBe(true);
  });

  test("behavior: read-only and unknown roles are not write access", () => {
    for (const permission of ["read", "triage", "none", "", "WRITE"]) {
      expect(hasWriteAccess(permission)).toBe(false);
    }
  });
});

describe("fetchPermission", () => {
  test("default", async () => {
    const fetchImpl = permissionFetch({ permission: "write" });

    await expect(
      fetchPermission({
        fetchImpl,
        login: "alice",
        repository: REPO,
        token: "t",
      }),
    ).resolves.toBe("write");
    expect(fetchImpl.calls[0]?.pathname).toBe(
      `/repos/${REPO}/collaborators/alice/permission`,
    );
  });

  test("behavior: 404 and 403 are unknown, not errors", async () => {
    for (const status of [403, 404]) {
      await expect(
        fetchPermission({
          fetchImpl: permissionFetch(status),
          login: "alice",
          repository: REPO,
          token: "t",
        }),
      ).resolves.toBeNull();
    }
  });

  test("behavior: a login is URL-encoded into the path", async () => {
    const fetchImpl = permissionFetch({ permission: "read" });
    await fetchPermission({
      fetchImpl,
      login: "a/../../admin",
      repository: REPO,
      token: "t",
    });

    expect(fetchImpl.calls[0]?.pathname).toBe(
      `/repos/${REPO}/collaborators/a%2F..%2F..%2Fadmin/permission`,
    );
  });

  test("error: an unexpected status fails loudly", async () => {
    await expect(
      fetchPermission({
        fetchImpl: permissionFetch(500),
        login: "alice",
        repository: REPO,
        token: "t",
      }),
    ).rejects.toThrow(/failed with 500/);
  });

  test("error: a malformed payload fails loudly", async () => {
    await expect(
      fetchPermission({
        fetchImpl: permissionFetch({ permission: 7 }),
        login: "alice",
        repository: REPO,
        token: "t",
      }),
    ).rejects.toThrow(/no "permission" string/);
  });
});

describe("authorize", () => {
  test("default: OWNER and MEMBER are authorized without an API call", async () => {
    for (const association of ["OWNER", "MEMBER"]) {
      const fetchImpl = permissionFetch(500);
      const decision = await authorize({
        env: humanEnv(association),
        fetchImpl,
      });

      expect(decision.authorized).toBe(true);
      expect(fetchImpl.calls).toHaveLength(0);
    }
  });

  test("behavior: COLLABORATOR with write access is authorized", async () => {
    const fetchImpl = permissionFetch({ permission: "write" });

    await expect(
      authorize({ env: humanEnv("COLLABORATOR"), fetchImpl }),
    ).resolves.toMatchObject({ authorized: true });
    expect(fetchImpl.calls).toHaveLength(1);
  });

  test("behavior: a read-only COLLABORATOR is denied", async () => {
    const decision = await authorize({
      env: humanEnv("COLLABORATOR"),
      fetchImpl: permissionFetch({ permission: "read" }),
    });

    expect(decision.authorized).toBe(false);
    expect(decision.reason).toMatch(/"read" permission/);
  });

  test("behavior: an unreadable permission denies rather than falling back", async () => {
    for (const status of [403, 404]) {
      await expect(
        authorize({
          env: humanEnv("COLLABORATOR"),
          fetchImpl: permissionFetch(status),
        }),
      ).resolves.toMatchObject({ authorized: false });
    }
  });

  test("behavior: CONTRIBUTOR and NONE are denied on a read-only permission", async () => {
    for (const association of [
      "CONTRIBUTOR",
      "FIRST_TIME_CONTRIBUTOR",
      "NONE",
    ]) {
      await expect(
        authorize({
          env: humanEnv(association),
          fetchImpl: permissionFetch(404),
        }),
      ).resolves.toMatchObject({ authorized: false });
    }
  });

  test("behavior: an allowlisted bot is authorized without an API call", async () => {
    const fetchImpl = permissionFetch(500);
    const decision = await authorize({
      env: {
        ...humanEnv("NONE", "devin-ai-integration[bot]"),
        SENDER_TYPE: "Bot",
      },
      fetchImpl,
    });

    expect(decision.authorized).toBe(true);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test("behavior: a pull_request event is settled by the workflow's same-repo filter", async () => {
    const fetchImpl = permissionFetch(500);
    const decision = await authorize({
      env: {
        ...humanEnv("CONTRIBUTOR"),
        AUTHOR_ASSOCIATION: "CONTRIBUTOR",
        EVENT_NAME: "pull_request",
      },
      fetchImpl,
    });

    expect(decision.authorized).toBe(true);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test("behavior: a pull_request from an unlisted bot is still denied", async () => {
    await expect(
      authorize({
        env: {
          ...humanEnv("OWNER", "attacker-app[bot]"),
          EVENT_NAME: "pull_request",
          SENDER_TYPE: "Bot",
        },
        fetchImpl: permissionFetch(500),
      }),
    ).resolves.toMatchObject({ authorized: false });
  });

  test("behavior: an unlisted bot is denied even when it claims a conclusive association", async () => {
    const decision = await authorize({
      env: {
        ...humanEnv("OWNER", "attacker-app[bot]"),
        SENDER_TYPE: "Bot",
      },
      fetchImpl: permissionFetch({ permission: "admin" }),
    });

    expect(decision.authorized).toBe(false);
    expect(decision.reason).toMatch(/not on the allowlist/);
  });

  test("error: missing SENDER_LOGIN", async () => {
    await expect(authorize({ env: { SENDER_TYPE: "User" } })).rejects.toThrow(
      /SENDER_LOGIN/,
    );
  });
});

describe("main", () => {
  test("default: writes authorized and the normalized allowlist to GITHUB_OUTPUT", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claude-trigger-gate-"));
    tempDirs.push(dir);
    const outputFile = join(dir, "github-output");
    const out: string[] = [];

    await main({
      env: { ...humanEnv("MEMBER"), ALLOWED_BOTS: "Cursor[bot], devin " },
      outputFile,
      writeOutput: (m) => out.push(m),
    });

    expect(readFileSync(outputFile, "utf8")).toBe(
      "authorized=true\nallowed_bots=cursor,devin\n",
    );
    expect(out).toEqual(["Authorized: alice is MEMBER.\n"]);
  });

  test("behavior: a denial is a normal outcome, not a thrown error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claude-trigger-gate-"));
    tempDirs.push(dir);
    const outputFile = join(dir, "github-output");
    const out: string[] = [];

    const decision = await main({
      env: humanEnv("CONTRIBUTOR", "mallory"),
      fetchImpl: permissionFetch(404),
      outputFile,
      writeOutput: (m) => out.push(m),
    });

    expect(decision.authorized).toBe(false);
    expect(readFileSync(outputFile, "utf8")).toMatch(/^authorized=false\n/);
    expect(out[0]).toMatch(/^Denied: mallory/);
  });
});
