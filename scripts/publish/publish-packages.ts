import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { isMain, reportCliError } from "../workflow.ts";
import {
  compareVersions,
  fetchRegistryState,
  type RegistryFetch,
} from "./plan-npm-publish.ts";
import type { ReleaseChannel } from "./verify-release-set.ts";

const REGISTRY = "https://registry.npmjs.org";
const ATTEMPTS = 3;

/** What npm holds for one exact version, compared with a local tarball. */
export type PublishedState = "identical" | "absent" | "different";

/** Runs `npm` with these arguments and returns its exit code; injectable for tests. */
export type RunNpm = (args: readonly string[]) => number;

/**
 * Computes the Subresource Integrity string npm records as `dist.integrity`.
 *
 * @param bytes - Tarball bytes.
 * @returns `sha512-<base64>`.
 */
export function tarballIntegrity(bytes: Uint8Array): string {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

/**
 * Reads whether `name@version` is on npm with the given integrity. A 404 means absent; any
 * other failure throws, so the caller never treats an unknown state as published.
 *
 * @param identity - Package name, version and the local tarball's integrity.
 * @param fetchFn - `fetch`, injectable for tests.
 */
export async function fetchPublishedState(
  {
    name,
    version,
    integrity,
  }: {
    readonly name: string;
    readonly version: string;
    readonly integrity: string;
  },
  fetchFn: RegistryFetch = (url) =>
    fetch(url, { headers: { accept: "application/json" } }),
): Promise<PublishedState> {
  const url = `${REGISTRY}/${name.replace("/", "%2F")}/${encodeURIComponent(version)}`;
  const response = await fetchFn(url);
  if (response.status === 404) return "absent";
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}.`);
  const body: unknown = await response.json();
  const dist =
    typeof body === "object" && body != null
      ? (body as Record<string, unknown>).dist
      : undefined;
  const published =
    typeof dist === "object" && dist != null
      ? (dist as Record<string, unknown>).integrity
      : undefined;
  if (typeof published !== "string" || !published.startsWith("sha512-")) {
    throw new Error(`GET ${url} returned no sha512 dist.integrity.`);
  }
  return published === integrity ? "identical" : "different";
}

/**
 * Publishes one tarball with provenance under `tag`. A failed `npm publish` is checked against
 * npm before deciding, because a timed-out request or a stale read in plan-npm-publish.ts can
 * hide that the version is already there: the exact bytes with `tag` at or above the version
 * count as published, other bytes fail at once, and anything else (absent, unreadable, a lagging
 * tag) is retried, three tries in all.
 *
 * @param row - Package name, version and tarball path, as plan-npm-publish.ts prints them.
 * @param options - Dist-tag and injectable npm, registry, sleep and log.
 * @throws If npm holds other bytes, or the version isn't published under `tag` after three tries.
 */
export async function publishTarball(
  row: {
    readonly name: string;
    readonly version: string;
    readonly tgz: string;
  },
  options: {
    readonly tag: ReleaseChannel;
    readonly runNpm: RunNpm;
    readonly fetchFn?: RegistryFetch;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly log?: (message: string) => void;
  },
): Promise<void> {
  const { name, version, tgz } = row;
  const { tag, runNpm, fetchFn } = options;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const log =
    options.log ?? ((message) => process.stdout.write(`${message}\n`));
  const integrity = tarballIntegrity(readFileSync(tgz));
  let problem = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    log(`Publishing ${name}@${version} (attempt ${attempt})`);
    const code = runNpm([
      "publish",
      tgz,
      "--provenance",
      "--access",
      "public",
      "--tag",
      tag,
      "--ignore-scripts",
      "--registry",
      REGISTRY,
    ]);
    if (code === 0) return;
    problem = `npm publish exited with ${code}`;
    try {
      const state = await fetchPublishedState(
        { name, version, integrity },
        fetchFn,
      );
      if (state === "different") {
        throw new Error(
          `${name}@${version} is on npm with different bytes than this run's tarball.`,
        );
      }
      if (state === "identical") {
        const current = (await fetchRegistryState(name, fetchFn))?.[tag];
        if (current != null && compareVersions(version, current) <= 0) {
          log(`${name}@${version} is already on npm with these exact bytes.`);
          return;
        }
        problem = `${name}@${version} is on npm, but ${tag} points to ${current ?? "nothing"}`;
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("different bytes")) {
        throw error;
      }
      problem = `the registry check failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (attempt < ATTEMPTS) await sleep(attempt * 30_000);
  }
  throw new Error(
    `Publishing ${name}@${version} failed ${ATTEMPTS} times; last: ${problem}.`,
  );
}

/**
 * `publish-packages.ts [--tag latest|next] <to-publish.tsv>` publishes each
 * `<name>\t<version>\t<file>` row that plan-npm-publish.ts printed, in order, stopping at the
 * first failure.
 *
 * @param argv - Command-line arguments.
 * @param options - Injectable npm, registry and sleep, for tests.
 */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
  options: {
    readonly runNpm?: RunNpm;
    readonly fetchFn?: RegistryFetch;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly log?: (message: string) => void;
  } = {},
): Promise<void> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: { tag: { type: "string", default: "latest" } },
  });
  const [file] = positionals;
  const { tag } = values;
  if (
    !file ||
    positionals.length !== 1 ||
    (tag !== "latest" && tag !== "next")
  ) {
    throw new Error(
      "Usage: node scripts/publish/publish-packages.ts [--tag latest|next] <to-publish.tsv>",
    );
  }
  const runNpm =
    options.runNpm ??
    ((args) => spawnSync("npm", args, { stdio: "inherit" }).status ?? 1);
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line === "") continue;
    const [name, version, tgz, ...rest] = line.split("\t");
    if (!name || !version || !tgz || rest.length > 0) {
      throw new Error(`Invalid publish row ${JSON.stringify(line)}.`);
    }
    await publishTarball({ name, version, tgz }, { ...options, tag, runNpm });
  }
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
