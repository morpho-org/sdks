import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { scanner } from "./release-age-scanner.ts";

const name = "release-age-scanner-fixture";
const oldVersion = "1.0.0";
const nextVersion = "1.1.0";
const oldTime = "2020-01-01T00:00:00Z";

async function runBun(cwd: string, args: readonly string[]) {
  const child = spawn("bun", args, { cwd });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      output += chunk;
    });
  }
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  return { code, output };
}

async function withRegistry(
  check: (
    dir: string,
    setTime: (timestamp: string | undefined) => void,
  ) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "bun-release-age-"));
  let timestamp: string | undefined;
  const server = createServer((request, response) => {
    if (request.url !== `/${name}`) {
      response.writeHead(404).end();
      return;
    }
    const versions = Object.fromEntries(
      [oldVersion, nextVersion].map((version) => [
        version,
        {
          name,
          version,
          dist: {
            tarball: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
          },
        },
      ]),
    );
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        name,
        "dist-tags": { latest: nextVersion },
        versions,
        time: { [oldVersion]: oldTime, [nextVersion]: timestamp },
      }),
    );
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.on("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No fixture server address.");
    const registry = `http://127.0.0.1:${address.port}`;
    await writeFile(
      join(dir, "bunfig.toml"),
      `[install]\nregistry = "${registry}"\nminimumReleaseAge = 259200\n[install.cache]\ndisable = true\n[install.security]\nscanner = "./scanner.ts"\n`,
    );
    await writeFile(
      join(dir, "scanner.ts"),
      `import { scanner } from ${JSON.stringify(fileURLToPath(new URL("./release-age-scanner.ts", import.meta.url)))};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => realFetch(
  String(url).replace("https://registry.npmjs.org/", ${JSON.stringify(`${registry}/`)}),
  init,
);
export { scanner };`,
    );
    await check(dir, (value) => {
      timestamp = value;
    });
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await rm(dir, { recursive: true, force: true });
  }
}

test.each(["add", "update", "install"])(
  "raw bun %s rejects a missing publication date before installing",
  async (command) => {
    await withRegistry(async (dir) => {
      const manifest = {
        name: "scanner-test",
        dependencies:
          command === "update"
            ? { [name]: oldVersion }
            : command === "install"
              ? { [name]: nextVersion }
              : {},
      };
      const base = JSON.stringify(manifest);
      await writeFile(join(dir, "package.json"), base);
      const lockfile = join(dir, "bun.lock");
      let oldLock: string | undefined;
      if (command === "update") {
        const seed = await runBun(dir, ["install", "--lockfile-only"]);
        expect(seed.code, seed.output).toBe(0);
        oldLock = await readFile(lockfile, "utf8");
        expect(oldLock).toContain(`${name}@${oldVersion}`);
      }
      const result = await runBun(
        dir,
        command === "install" ? [command] : [command, `${name}@${nextVersion}`],
      );
      expect(result.code).toBe(1);
      expect(result.output).toContain(
        `${name}@${nextVersion}: missing or invalid publication timestamp.`,
      );
      expect(await readFile(join(dir, "package.json"), "utf8")).toBe(base);
      if (oldLock === undefined)
        await expect(readFile(lockfile)).rejects.toMatchObject({
          code: "ENOENT",
        });
      else expect(await readFile(lockfile, "utf8")).toBe(oldLock);
      await expect(
        readFile(join(dir, "node_modules", name, "package.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    });
  },
);

test("workspace add cannot skip the scanner with --ignore-scripts", async () => {
  await withRegistry(async (dir) => {
    const workspace = join(dir, "packages", "app");
    await mkdir(workspace, { recursive: true });
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({ name: "app" }),
    );
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    const result = await runBun(workspace, [
      "add",
      `${name}@${nextVersion}`,
      "--ignore-scripts",
    ]);
    expect(result.code).toBe(1);
    expect(result.output).toContain(
      `${name}@${nextVersion}: missing or invalid publication timestamp.`,
    );
  });
});

test("an eligible version can be locked, but a one-hour-old version cannot", async () => {
  await withRegistry(async (dir, setTime) => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "scanner-test" }),
    );
    setTime(new Date(Date.now() - 3_600_000).toISOString());
    const args = ["add", `${name}@${nextVersion}`, "--lockfile-only"];
    const young = await runBun(dir, args);
    expect(young.code).toBe(1);
    expect(young.output).toContain("blocked by minimum-release-age");
    setTime(oldTime);
    const old = await runBun(dir, args);
    expect(old.code, old.output).toBe(0);
    expect(await readFile(join(dir, "bun.lock"), "utf8")).toContain(
      `${name}@${nextVersion}`,
    );
  });
});

test.each([
  {
    version: "file:./package.tgz",
    tarball: "./package.tgz",
    error: "Unsupported resolution",
  },
  {
    version: "1.0.0",
    tarball: "https://example.org/package-1.0.0.tgz",
    error: "Non-registry resolution",
  },
  {
    version: "1.0.0",
    tarball: "https://registry.npmjs.org/other/-/other-1.0.0.tgz",
    error: "Non-registry resolution",
  },
])(
  "rejects a tarball with unproven npm identity: $tarball",
  async ({ version, tarball, error }) => {
    await expect(
      scanner.scan({ packages: [{ name, version, tarball }] }),
    ).rejects.toThrow(error);
  },
);
