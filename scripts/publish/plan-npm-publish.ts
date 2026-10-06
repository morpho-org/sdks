import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { isMain, reportCliError, writeStdout } from "../workflow.ts";
import type { TarballIdentity } from "./read-tarball-identity.ts";

const REGISTRY = "https://registry.npmjs.org";

/** What npm already holds for a package. */
export interface RegistryState {
  /** Versions currently on the registry. */
  readonly versions: readonly string[];
  /** Versions ever published, including unpublished ones npm refuses to reuse. */
  readonly everPublished: readonly string[];
  /** The `latest` dist-tag, when set. */
  readonly latest?: string;
}

/** Fetches the full packument, so `time` lists every version ever published. */
export type RegistryFetch = (url: string) => Promise<Response>;

/**
 * Compares two versions by SemVer precedence: the `x.y.z` core, then a prerelease
 * sorts below its stable core, and prerelease identifiers compare one by one (numeric
 * ones numerically and below alphanumeric ones, which compare in ASCII order).
 *
 * @returns A negative number, zero or a positive number, like a sort comparator.
 */
export function compareVersions(a: string, b: string): number {
  const [left, right] = [a, b].map((version) => {
    const match =
      /^(\d+)\.(\d+)\.(\d+)(?:-([0-9a-z-]+(?:\.[0-9a-z-]+)*))?(?:\+[0-9a-z.-]+)?$/i.exec(
        version,
      );
    if (!match) throw new Error(`Unrecognized version "${version}".`);
    return {
      core: [Number(match[1]), Number(match[2]), Number(match[3])],
      prerelease: match[4]?.split(".") ?? [],
    };
  });
  if (left == null || right == null) throw new Error("Unreachable.");
  for (let i = 0; i < 3; i++) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return right.prerelease.length - left.prerelease.length;
  }
  for (
    let i = 0;
    i < Math.min(left.prerelease.length, right.prerelease.length);
    i++
  ) {
    const l = left.prerelease[i] ?? "";
    const r = right.prerelease[i] ?? "";
    if (l === r) continue;
    const lNum = /^\d+$/.test(l);
    const rNum = /^\d+$/.test(r);
    if (lNum && rNum) return Number(l) - Number(r);
    if (lNum !== rNum) return lNum ? -1 : 1;
    return l < r ? -1 : 1;
  }
  return left.prerelease.length - right.prerelease.length;
}

/**
 * Decides whether release.yml publishes a tarball. A version already on npm is skipped, so
 * reruns are idempotent. A version npm would refuse, or one that would move `latest` back
 * (a rerun of an older release after a newer one shipped), fails the job before any upload.
 *
 * @param tarball - Identity read from the tarball.
 * @param state - Registry state, or `undefined` for a package npm has never seen.
 * @returns `true` to publish, `false` to skip.
 */
export function shouldPublish(
  { name, version }: TarballIdentity,
  state: RegistryState | undefined,
): boolean {
  if (state == null) return true;
  if (state.versions.includes(version)) return false;
  if (state.everPublished.includes(version)) {
    throw new Error(
      `${name}@${version} was published and then removed; npm refuses to reuse it. Release a new version.`,
    );
  }
  if (state.latest != null && compareVersions(version, state.latest) <= 0) {
    throw new Error(
      `${name}@${version} is not newer than latest ${state.latest}; publishing it would move latest back. Release a new version.`,
    );
  }
  return true;
}

/**
 * Reads a package's state from npmjs. A 404 means npm has never seen the package; any
 * other failure throws, so the job never publishes on a guess.
 *
 * @param name - Package name.
 * @param fetchFn - `fetch`, injectable for tests.
 */
export async function fetchRegistryState(
  name: string,
  fetchFn: RegistryFetch = (url) =>
    fetch(url, { headers: { accept: "application/json" } }),
): Promise<RegistryState | undefined> {
  const url = `${REGISTRY}/${name.replace("/", "%2F")}`;
  const response = await fetchFn(url);
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(`GET ${url} returned ${response.status}.`);
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body == null) {
    throw new Error(`GET ${url} returned a non-object packument.`);
  }
  const fields = body as Record<string, unknown>;
  // versions, time and dist-tags must all be objects: a missing dist-tags would
  // hide latest and skip the guard against moving it back.
  const [versions, time, distTags] = (
    ["versions", "time", "dist-tags"] as const
  ).map((field) => {
    const value = fields[field];
    if (typeof value !== "object" || value == null || Array.isArray(value)) {
      throw new Error(`Packument of ${name} has no "${field}" object.`);
    }
    return value as Record<string, unknown>;
  });
  if (versions == null || time == null || distTags == null) {
    throw new Error("Unreachable.");
  }
  const { latest } = distTags;
  if (latest != null && typeof latest !== "string") {
    throw new Error(`Packument of ${name} has a non-string latest tag.`);
  }
  if (latest == null && Object.keys(versions).length > 0) {
    throw new Error(`Packument of ${name} has versions but no latest tag.`);
  }
  return {
    versions: Object.keys(versions),
    everPublished: Object.keys(time).filter(
      (key) => key !== "created" && key !== "modified",
    ),
    ...(latest == null ? {} : { latest }),
  };
}

/**
 * `plan-npm-publish.ts <release-set.tsv>` reads the `<name>\t<version>\t<file>` rows that
 * verify-release-set.ts printed and prints the rows to publish, in the same format.
 *
 * @param argv - Command-line arguments.
 */
async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const { positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
  });
  const [file] = positionals;
  if (!file || positionals.length !== 1) {
    throw new Error(
      "Usage: node scripts/publish/plan-npm-publish.ts <release-set.tsv>",
    );
  }
  const rows: string[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line === "") continue;
    const [name, version, tgz, ...rest] = line.split("\t");
    if (!name || !version || !tgz || rest.length > 0) {
      throw new Error(`Invalid release-set row ${JSON.stringify(line)}.`);
    }
    if (shouldPublish({ name, version }, await fetchRegistryState(name))) {
      rows.push(`${line}\n`);
    } else {
      process.stderr.write(`Already on npm: ${name}@${version}\n`);
    }
  }
  writeStdout(rows.join(""));
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
