import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";

import { type GitHub, GitHubApiError } from "./github.ts";
import {
  BUILD_BRANCH,
  batchFileChanges,
  buildReleaseMessage,
  parseSourceCommit,
  planFileChanges,
  SYNC_BRANCH,
  syncPublic,
} from "./sync.ts";

const sha = (seed: string) => createHash("sha1").update(seed).digest("hex");
const blobSha = (content: string) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0${content}`)
    .digest("hex");

/** Git tree hash of regular 100644 files, as `git write-tree` computes it. */
function treeHash(files: ReadonlyMap<string, string>): string {
  const children = new Map<string, Map<string, string> | string>();
  for (const [path, content] of files) {
    const [head = "", ...rest] = path.split("/");
    if (rest.length === 0) {
      children.set(head, blobSha(content));
    } else {
      const sub = children.get(head);
      const map = sub instanceof Map ? sub : new Map<string, string>();
      map.set(rest.join("/"), content);
      children.set(head, map);
    }
  }
  const entries = [...children].map(([name, value]) =>
    typeof value === "string"
      ? { key: name, mode: "100644", name, hash: value }
      : { key: `${name}/`, mode: "40000", name, hash: treeHash(value) },
  );
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const body = Buffer.concat(
    entries.map((e) =>
      Buffer.concat([
        Buffer.from(`${e.mode} ${e.name}\0`),
        Buffer.from(e.hash, "hex"),
      ]),
    ),
  );
  return createHash("sha1")
    .update(`tree ${body.length}\0`)
    .update(body)
    .digest("hex");
}

interface FakeCommit {
  readonly files: Map<string, string>;
  readonly message: string;
  readonly parents: string[];
}

interface FakePull {
  number: number;
  state: string;
  title: string;
  body: string;
  auto_merge: {
    merge_method: string;
    commit_title: string;
    commit_message: string;
  } | null;
}

/** In-memory model of the public repository's REST and GraphQL API. */
class FakeGitHub implements GitHub {
  readonly commits = new Map<string, FakeCommit>();
  readonly refs = new Map<string, string>();
  readonly pulls: FakePull[] = [];
  readonly calls: string[] = [];
  signCommits = true;
  /** `mergeStateStatus` the PR reports. */
  mergeState = "BLOCKED";
  /** Adds a stray file to every built commit, so its tree is wrong. */
  corruptTree = false;
  /** Runs after each built commit, e.g. to move `main` mid-sync. */
  onCommit: (() => void) | undefined;
  private counter = 0;

  constructor(files: Record<string, string>, message = "Initial commit") {
    this.refs.set(
      "main",
      this.addCommit({ files: new Map(Object.entries(files)), message }),
    );
  }

  addCommit({
    files,
    message,
    parents = [],
  }: {
    files: Map<string, string>;
    message: string;
    parents?: string[];
  }) {
    const id = sha(`commit ${this.counter++}`);
    this.commits.set(id, { files, message, parents });
    return id;
  }

  /** Merges the open sync PR the way a squash auto-merge does. */
  merge(pull: FakePull) {
    const head = this.commits.get(this.refs.get(SYNC_BRANCH) ?? "");
    if (!head || !pull.auto_merge) throw new Error("not mergeable");
    this.refs.set(
      "main",
      this.addCommit({
        files: new Map(head.files),
        message: `${pull.auto_merge.commit_title}\n\n${pull.auto_merge.commit_message}`,
        parents: [this.refs.get("main") ?? ""],
      }),
    );
    pull.state = "closed";
  }

  private commitJson(id: string) {
    const commit = this.commits.get(id);
    if (!commit) throw new GitHubApiError("missing commit", 404);
    return {
      sha: id,
      message: commit.message,
      tree: { sha: treeHash(commit.files) },
      parents: commit.parents.map((parent) => ({ sha: parent })),
      verification: this.signCommits
        ? { verified: true, reason: "valid" }
        : { verified: false, reason: "unsigned" },
    };
  }

  private pullJson(pull: FakePull) {
    return {
      number: pull.number,
      node_id: `PR_${pull.number}`,
      head: { sha: this.refs.get(SYNC_BRANCH) },
      auto_merge: pull.auto_merge,
    };
  }

  async rest(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<unknown> {
    const { method = "GET", body } = init;
    this.calls.push(`${method} ${path}`);
    const route = path.replace(/^repos\/morpho-org\/sdks\//, "");
    const input = body as Record<string, string>;
    let match: RegExpExecArray | null;
    if ((match = /^git\/ref\/heads\/(.+)$/.exec(route)) && method === "GET") {
      const ref = this.refs.get(match[1] ?? "");
      if (ref === undefined) throw new GitHubApiError("Not Found", 404);
      return { object: { sha: ref } };
    }
    if (route === "git/refs" && method === "POST") {
      const name = (input.ref ?? "").replace("refs/heads/", "");
      if (this.refs.has(name)) throw new GitHubApiError("exists", 422);
      this.refs.set(name, input.sha ?? "");
      return {};
    }
    if ((match = /^git\/refs\/heads\/(.+)$/.exec(route))) {
      const name = match[1] ?? "";
      if (!this.refs.has(name)) throw new GitHubApiError("missing", 422);
      if (method === "DELETE") this.refs.delete(name);
      else this.refs.set(name, input.sha ?? "");
      return undefined;
    }
    if ((match = /^compare\/(\w+)\.\.\.(\w+)$/.exec(route))) {
      let id: string | undefined = match[2];
      while (id !== undefined && id !== match[1]) {
        id = this.commits.get(id)?.parents[0];
      }
      return { behind_by: id === undefined ? 1 : 0 };
    }
    if ((match = /^git\/commits\/(\w+)$/.exec(route))) {
      return this.commitJson(match[1] ?? "");
    }
    if ((match = /^git\/trees\/(\w+)\?recursive=1$/.exec(route))) {
      const commit = [...this.commits.values()].find(
        (c) => treeHash(c.files) === match?.[1],
      );
      if (!commit) throw new GitHubApiError("missing tree", 404);
      return {
        truncated: false,
        tree: [...commit.files].map(([file, content]) => ({
          path: file,
          type: "blob",
          mode: "100644",
          sha: blobSha(content),
        })),
      };
    }
    if (route.startsWith("pulls?") && method === "GET") {
      expect(route).toContain(`head=morpho-org:${SYNC_BRANCH}`);
      return this.pulls
        .filter((pull) => pull.state === "open")
        .map((pull) => this.pullJson(pull));
    }
    if (route === "pulls" && method === "POST") {
      const pull: FakePull = {
        number: this.pulls.length + 1,
        state: "open",
        title: input.title ?? "",
        body: input.body ?? "",
        auto_merge: null,
      };
      this.pulls.push(pull);
      return this.pullJson(pull);
    }
    if ((match = /^pulls\/(\d+)$/.exec(route)) && method === "PATCH") {
      const pull = this.pulls[Number(match[1]) - 1];
      if (!pull) throw new GitHubApiError("missing pull", 404);
      pull.title = input.title ?? pull.title;
      pull.body = input.body ?? pull.body;
      return this.pullJson(pull);
    }
    throw new Error(`Unexpected ${method} ${path}`);
  }

  async graphql(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<unknown> {
    const input = variables.input as Record<string, unknown>;
    const name = /\{\s*(\w+)\(/.exec(query)?.[1] ?? "";
    this.calls.push(`graphql ${name}`);
    if (name === "node") {
      return { node: { mergeStateStatus: this.mergeState } };
    }
    const pull = () => {
      const pr = this.pulls[Number(String(input.pullRequestId).slice(3)) - 1];
      if (!pr) throw new Error("missing pull");
      return pr;
    };
    if (name === "createCommitOnBranch") {
      const branch = input.branch as { branchName: string };
      const head = this.refs.get(branch.branchName);
      if (head !== input.expectedHeadOid) throw new Error("head moved");
      const changes = input.fileChanges as {
        additions: { path: string; contents: string }[];
        deletions: { path: string }[];
      };
      const files = new Map(this.commits.get(head ?? "")?.files);
      for (const { path } of changes.deletions) files.delete(path);
      for (const { path, contents } of changes.additions) {
        files.set(path, Buffer.from(contents, "base64").toString());
      }
      if (this.corruptTree) files.set("stray", "x");
      const message = input.message as { headline: string; body: string };
      const id = this.addCommit({
        files,
        message: `${message.headline}\n\n${message.body}`,
        parents: [head ?? ""],
      });
      this.refs.set(branch.branchName, id);
      this.onCommit?.();
      return { createCommitOnBranch: { commit: { oid: id } } };
    }
    if (name === "enablePullRequestAutoMerge") {
      expect(input.expectedHeadOid).toBe(this.refs.get(SYNC_BRANCH));
      pull().auto_merge = {
        merge_method: String(input.mergeMethod).toLowerCase(),
        commit_title: String(input.commitHeadline),
        commit_message: String(input.commitBody),
      };
      return {};
    }
    if (name === "mergePullRequest") {
      const pr = pull();
      expect(input.expectedHeadOid).toBe(this.refs.get(SYNC_BRANCH));
      pr.auto_merge = {
        merge_method: String(input.mergeMethod).toLowerCase(),
        commit_title: String(input.commitHeadline),
        commit_message: String(input.commitBody),
      };
      this.merge(pr);
      return {};
    }
    if (name === "disablePullRequestAutoMerge") {
      pull().auto_merge = null;
      return {};
    }
    throw new Error(`Unexpected GraphQL ${name}`);
  }
}

// Internal history is linear: each release descends from the previous ones.
const history = ["r1", "r2", "r3"].map(sha);
const [R1 = "", R2 = "", R3 = ""] = history;
const isAncestor = (ancestor: string, descendant: string) =>
  history.indexOf(ancestor) <= history.indexOf(descendant) &&
  history.includes(ancestor);

function release(sourceCommit: string, files: Record<string, string>) {
  const map = new Map(Object.entries(files));
  return {
    manifest: {
      sourceCommit,
      treeHash: treeHash(map),
      files: [...map.keys()].map((path) => ({
        path,
        mode: "100644" as const,
        sha256: "",
      })),
    },
    readFile: (path: string) => Buffer.from(map.get(path) ?? ""),
    packages: [{ name: "@morpho-org/a", version: "1.0.0" }],
    isAncestor,
  };
}

test("the fake hashes trees like git write-tree", () => {
  const files = {
    "README.md": "v1",
    "packages/a/index.js": "1",
    "old.txt": "o",
  };
  expect(treeHash(new Map(Object.entries(files)))).toBe(
    "6815d7114999b49501088a3a5e149cb458966839",
  );
});

describe("buildReleaseMessage", () => {
  test("lists packages and carries both trailers", () => {
    expect(
      buildReleaseMessage({
        packages: [
          { name: "@morpho-org/a", version: "1.0.0" },
          { name: "@morpho-org/b", version: "2.1.0" },
        ],
        sourceCommit: R1,
        treeHash: R2,
      }),
    ).toEqual({
      headline: "Release @morpho-org/a@1.0.0, @morpho-org/b@2.1.0",
      body: `Source-Commit: ${R1}\nPublic-Tree: ${R2}`,
    });
  });

  test("rejects an empty release and short hashes", () => {
    expect(() =>
      buildReleaseMessage({ packages: [], sourceCommit: R1, treeHash: R2 }),
    ).toThrow("at least one package");
    expect(() =>
      buildReleaseMessage({
        packages: [{ name: "a", version: "1" }],
        sourceCommit: "abc",
        treeHash: R2,
      }),
    ).toThrow('got "abc"');
  });
});

describe("parseSourceCommit", () => {
  test("reads the trailer, or nothing", () => {
    expect(
      parseSourceCommit(
        `Release a@1\n\nSource-Commit: ${R1}\nPublic-Tree: ${R2}`,
      ),
    ).toBe(R1);
    expect(parseSourceCommit("Initial commit")).toBeUndefined();
    expect(parseSourceCommit(`x Source-Commit: ${R1}`)).toBeUndefined();
  });

  test("rejects conflicting trailers", () => {
    expect(() =>
      parseSourceCommit(`Source-Commit: ${R1}\nSource-Commit: ${R2}`),
    ).toThrow("2 different");
  });
});

describe("planFileChanges and batchFileChanges", () => {
  test("adds changed files and deletes removed ones", () => {
    const changes = planFileChanges(
      [
        { path: "same", content: Buffer.from("x") },
        { path: "changed", content: Buffer.from("new") },
        { path: "added", content: Buffer.from("a") },
      ],
      new Map([
        ["same", blobSha("x")],
        ["changed", blobSha("old")],
        ["gone", blobSha("g")],
      ]),
    );
    expect(changes).toEqual({
      additions: [
        { path: "changed", contents: Buffer.from("new").toString("base64") },
        { path: "added", contents: Buffer.from("a").toString("base64") },
      ],
      deletions: [{ path: "gone" }],
    });
  });

  test("packs additions under the budget, deletions first", () => {
    const addition = (path: string) => ({ path, contents: "x".repeat(9) });
    const batches = batchFileChanges(
      {
        additions: ["a", "b", "c"].map(addition),
        deletions: [{ path: "gone" }],
      },
      20,
    );
    expect(batches.map((b) => b.additions.map((a) => a.path))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
    expect(batches.map((b) => b.deletions.length)).toEqual([1, 0]);
  });

  test("returns one batch for a deletion-only change and rejects oversized files", () => {
    expect(
      batchFileChanges({ additions: [], deletions: [{ path: "x" }] }, 10),
    ).toEqual([{ additions: [], deletions: [{ path: "x" }] }]);
    expect(() =>
      batchFileChanges(
        {
          additions: [{ path: "big", contents: "x".repeat(11) }],
          deletions: [],
        },
        10,
      ),
    ).toThrow('"big" is 14 bytes');
  });
});

describe("syncPublic", () => {
  const v1 = { "README.md": "v1", "packages/a/index.js": "1", "old.txt": "o" };
  const v2 = { "README.md": "v2", "packages/a/index.js": "2" };

  test("first sync opens one signed PR in batches and arms squash auto-merge", async () => {
    const github = new FakeGitHub({ "README.md": "placeholder" });
    const r = release(R1, v1);
    const outcome = await syncPublic({ github, ...r, maxBatchBytes: 30 });
    expect(outcome).toEqual({ type: "opened", pr: 1 });

    const head = github.refs.get(SYNC_BRANCH) ?? "";
    const commit = github.commits.get(head);
    expect(treeHash(commit?.files ?? new Map())).toBe(r.manifest.treeHash);
    expect(
      github.calls.filter((c) => c === "graphql createCommitOnBranch").length,
    ).toBeGreaterThan(1);
    expect(github.refs.has(BUILD_BRANCH)).toBe(false);
    expect(github.pulls[0]?.auto_merge).toEqual({
      merge_method: "squash",
      commit_title: "Release @morpho-org/a@1.0.0",
      commit_message: `Source-Commit: ${R1}\nPublic-Tree: ${r.manifest.treeHash}`,
    });
  });

  test("a rerun of the same release changes nothing, before and after merge", async () => {
    const github = new FakeGitHub({});
    const r = { ...release(R1, v1), maxBatchBytes: 30 };
    await syncPublic({ github, ...r });
    const commits = github.commits.size;
    expect(await syncPublic({ github, ...r })).toEqual({
      type: "pr-current",
      pr: 1,
    });
    expect(github.commits.size).toBe(commits);

    const pull = github.pulls[0];
    if (!pull) throw new Error("no pull");
    github.merge(pull);
    const writes = github.calls.length;
    expect(await syncPublic({ github, ...r })).toEqual({ type: "up-to-date" });
    expect(github.calls.slice(writes).every((c) => c.startsWith("GET"))).toBe(
      true,
    );
    expect(github.pulls).toHaveLength(1);
  });

  test("a merged release can't be synced again with a different tree", async () => {
    const github = new FakeGitHub({});
    await syncPublic({ github, ...release(R1, v1) });
    const pull = github.pulls[0];
    if (!pull) throw new Error("no pull");
    github.merge(pull);
    const writes = github.calls.length;
    await expect(syncPublic({ github, ...release(R1, v2) })).rejects.toThrow(
      "can't be synced twice",
    );
    expect(github.calls.slice(writes).every((c) => c.startsWith("GET"))).toBe(
      true,
    );
  });

  test("re-arms auto-merge on a current PR whose auto-merge was turned off", async () => {
    const github = new FakeGitHub({});
    const r = release(R1, v1);
    await syncPublic({ github, ...r });
    const pull = github.pulls[0];
    if (!pull) throw new Error("no pull");
    pull.auto_merge = null;
    await syncPublic({ github, ...r });
    expect(github.pulls[0]?.auto_merge?.commit_title).toBe(
      "Release @morpho-org/a@1.0.0",
    );
  });

  test("merges a current PR whose checks already passed instead of arming auto-merge", async () => {
    const github = new FakeGitHub({});
    const r = release(R1, v1);
    await syncPublic({ github, ...r });
    const pull = github.pulls[0];
    if (!pull) throw new Error("no pull");
    pull.auto_merge = null;
    github.mergeState = "CLEAN";
    const before = github.calls.length;
    expect(await syncPublic({ github, ...r })).toEqual({
      type: "merged",
      pr: 1,
    });
    expect(github.calls.slice(before)).not.toContain(
      "graphql enablePullRequestAutoMerge",
    );
    const main = github.commits.get(github.refs.get("main") ?? "");
    expect(treeHash(main?.files ?? new Map())).toBe(r.manifest.treeHash);
    expect(main?.message).toContain(`Source-Commit: ${R1}`);
    expect(pull.state).toBe("closed");
  });

  test("rebuilds an open PR with the right tree once public main moved past its base", async () => {
    const github = new FakeGitHub({});
    const r2 = release(R2, v2);
    await syncPublic({ github, ...r2 });
    const moved = github.addCommit({
      files: new Map(Object.entries(v1)),
      message: `Release a@1\n\nSource-Commit: ${R1}`,
      parents: [github.refs.get("main") ?? ""],
    });
    github.refs.set("main", moved);
    expect(await syncPublic({ github, ...r2 })).toEqual({
      type: "updated",
      pr: 1,
    });
    expect(github.calls).toContain("graphql disablePullRequestAutoMerge");
    const head = github.commits.get(github.refs.get(SYNC_BRANCH) ?? "");
    expect(head?.parents).toEqual([moved]);
    expect(treeHash(head?.files ?? new Map())).toBe(r2.manifest.treeHash);
    expect(github.pulls[0]?.auto_merge?.commit_message).toContain(R2);
  });

  test("a final tree mismatch stops the sync before sync/main or the PR moves", async () => {
    const github = new FakeGitHub({});
    await syncPublic({ github, ...release(R1, v1) });
    const head = github.refs.get(SYNC_BRANCH);
    const title = github.pulls[0]?.title;
    github.corruptTree = true;
    await expect(syncPublic({ github, ...release(R2, v2) })).rejects.toThrow(
      "Nothing was published",
    );
    expect(github.refs.get(SYNC_BRANCH)).toBe(head);
    expect(github.pulls[0]?.title).toBe(title);
    expect(github.calls).not.toContain("PATCH repos/morpho-org/sdks/pulls/1");
  });

  test("public main moving during the build stops the sync before sync/main moves", async () => {
    const github = new FakeGitHub({});
    github.onCommit = () => {
      github.refs.set(
        "main",
        github.addCommit({ files: new Map(), message: "", parents: [] }),
      );
    };
    await expect(syncPublic({ github, ...release(R1, v1) })).rejects.toThrow(
      "Public main moved during the sync",
    );
    expect(github.refs.has(SYNC_BRANCH)).toBe(false);
    expect(github.pulls).toHaveLength(0);
  });

  test("a non-regular file mode fails before the open PR is disarmed", async () => {
    const github = new FakeGitHub({});
    await syncPublic({ github, ...release(R1, v1) });
    const armed = github.pulls[0]?.auto_merge;
    const writes = github.calls.length;
    const r2 = release(R2, v2);
    await expect(
      syncPublic({
        github,
        ...r2,
        manifest: {
          ...r2.manifest,
          files: r2.manifest.files.map((f) => ({ ...f, mode: "100755" })),
        },
      }),
    ).rejects.toThrow("mode 100755");
    expect(github.pulls[0]?.auto_merge).toEqual(armed);
    expect(github.calls.slice(writes)).toEqual([]);
  });

  test("a newer release supersedes the open sync PR", async () => {
    const github = new FakeGitHub({});
    await syncPublic({ github, ...release(R1, v1) });
    const r2 = release(R2, v2);
    expect(await syncPublic({ github, ...r2 })).toEqual({
      type: "updated",
      pr: 1,
    });
    expect(github.pulls).toHaveLength(1);
    expect(github.calls).toContain("graphql disablePullRequestAutoMerge");
    const head = github.commits.get(github.refs.get(SYNC_BRANCH) ?? "");
    expect(head?.parents).toEqual([github.refs.get("main")]);
    expect(treeHash(head?.files ?? new Map())).toBe(r2.manifest.treeHash);
    expect(github.pulls[0]?.auto_merge?.commit_message).toContain(R2);
  });

  test("an older release can't replace a newer open sync PR", async () => {
    const github = new FakeGitHub({});
    await syncPublic({ github, ...release(R2, v2) });
    const head = github.refs.get(SYNC_BRANCH);
    await expect(syncPublic({ github, ...release(R1, v1) })).rejects.toThrow(
      "Only a newer release can supersede it.",
    );
    expect(github.refs.get(SYNC_BRANCH)).toBe(head);
  });

  test("an older release than public main fails ordering and writes nothing", async () => {
    const github = new FakeGitHub(v2, `Release a@2\n\nSource-Commit: ${R2}`);
    github.addCommit({ files: new Map(), message: "" });
    const refs = new Map(github.refs);
    await expect(syncPublic({ github, ...release(R1, v1) })).rejects.toThrow(
      "Only a newer release can be synced.",
    );
    await expect(
      syncPublic({ github, ...release(sha("unrelated"), v1) }),
    ).rejects.toThrow("doesn't descend");
    expect(github.refs).toEqual(refs);
    expect(github.calls.every((c) => c.startsWith("GET"))).toBe(true);
  });

  test("only a root commit may lack a Source-Commit", async () => {
    const github = new FakeGitHub({});
    const root = github.refs.get("main") ?? "";
    github.refs.set(
      "main",
      github.addCommit({
        files: new Map(),
        message: "manual push",
        parents: [root],
      }),
    );
    await expect(syncPublic({ github, ...release(R3, v1) })).rejects.toThrow(
      "isn't the root commit",
    );
  });

  test("an unverified commit stops the sync before the PR moves", async () => {
    const github = new FakeGitHub({});
    github.signCommits = false;
    await expect(syncPublic({ github, ...release(R1, v1) })).rejects.toThrow(
      "isn't verified",
    );
    expect(github.refs.has(SYNC_BRANCH)).toBe(false);
    expect(github.pulls).toHaveLength(0);
  });

  test("refuses several open sync PRs and non-regular file modes", async () => {
    const github = new FakeGitHub({});
    for (const number of [1, 2]) {
      github.pulls.push({
        number,
        state: "open",
        title: "",
        body: "",
        auto_merge: null,
      });
    }
    github.refs.set(SYNC_BRANCH, github.refs.get("main") ?? "");
    await expect(syncPublic({ github, ...release(R1, v1) })).rejects.toThrow(
      "2 sync PRs are open",
    );

    const exec = release(R1, v1);
    const clean = new FakeGitHub({});
    await expect(
      syncPublic({
        github: clean,
        ...exec,
        manifest: {
          ...exec.manifest,
          files: exec.manifest.files.map((f) => ({ ...f, mode: "100755" })),
        },
      }),
    ).rejects.toThrow("mode 100755");
  });
});
