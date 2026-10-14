import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { isMain, reportCliError, writeStdout } from "../workflow.ts";
import type { TarballIdentity } from "./read-tarball-identity.ts";
import type { ReleaseChannel } from "./verify-release-set.ts";

const REGISTRY = "https://registry.npmjs.org";

/** What npm already holds for a package. */
export interface RegistryState {
  /** Versions currently on the registry. */
  readonly versions: readonly string[];
  /** Versions ever published, including unpublished ones npm refuses to reuse. */
  readonly everPublished: readonly string[];
  /** The `latest` dist-tag, when set. */
  readonly latest?: string;
  /** The `next` dist-tag, when set. */
  readonly next?: string;
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
 * reruns are idempotent. A version npm would refuse, or one that would move the dist-tag it
 * publishes under back (a rerun of an older release after a newer one shipped), fails the
 * job before any upload.
 *
 * @param tarball - Identity read from the tarball, and the dist-tag it publishes under
 *   (`latest` by default).
 * @param state - Registry state, or `undefined` for a package npm has never seen.
 * @returns `true` to publish, `false` to skip.
 * @throws If a package without a `latest` version on npm would publish under `next`: npm
 *   would also point `latest` at that prerelease.
 */
export function shouldPublish(
  {
    name,
    version,
    tag = "latest",
  }: TarballIdentity & { readonly tag?: ReleaseChannel },
  state: RegistryState | undefined,
): boolean {
  if (tag === "next" && state?.latest == null) {
    throw new Error(
      `${name}@${version} would be ${name}'s only version on npm, and npm points latest at it whatever --tag says. Publish a stable version from main first.`,
    );
  }
  if (state == null) return true;
  if (state.versions.includes(version)) return false;
  if (state.everPublished.includes(version)) {
    throw new Error(
      `${name}@${version} was published and then removed; npm refuses to reuse it. Release a new version.`,
    );
  }
  const current = state[tag];
  if (current != null && compareVersions(version, current) <= 0) {
    throw new Error(
      `${name}@${version} is not newer than ${tag} ${current}; publishing it would move ${tag} back. Release a new version.`,
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
  const rawTime = fields.time;
  const tombstone =
    typeof rawTime === "object" && rawTime != null && !Array.isArray(rawTime)
      ? (rawTime as Record<string, unknown>).unpublished
      : undefined;
  // npm answers a fully unpublished package with a tombstone: no versions or
  // dist-tags, and the unpublished versions under time.unpublished.versions.
  if (tombstone !== undefined) {
    const gone =
      typeof tombstone === "object" && tombstone != null
        ? (tombstone as Record<string, unknown>).versions
        : undefined;
    if (
      !Array.isArray(gone) ||
      !gone.every((version) => typeof version === "string") ||
      fields.versions !== undefined ||
      fields["dist-tags"] !== undefined
    ) {
      throw new Error(
        `Packument of ${name} has a malformed unpublished tombstone.`,
      );
    }
    const listed = Object.keys(rawTime as object).filter(
      (key) => key !== "created" && key !== "modified" && key !== "unpublished",
    );
    return { versions: [], everPublished: [...new Set([...listed, ...gone])] };
  }
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
  const { latest, next } = distTags;
  if (latest != null && typeof latest !== "string") {
    throw new Error(`Packument of ${name} has a non-string latest tag.`);
  }
  if (next != null && typeof next !== "string") {
    throw new Error(`Packument of ${name} has a non-string next tag.`);
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
    ...(next == null ? {} : { next }),
  };
}

/**
 * `plan-npm-publish.ts [--tag latest|next] <release-set.tsv>` reads the
 * `<name>\t<version>\t<file>` rows that verify-release-set.ts printed and prints the rows
 * to publish under that dist-tag (default `latest`), in the same format.
 *
 * Skipped rows are reported on stderr.
 *
 * @param argv - Command-line arguments.
 * @param io - Registry fetch and output writers, injectable for tests.
 */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
  io: {
    fetchFn?: RegistryFetch;
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
  } = {},
): Promise<void> {
  const {
    fetchFn,
    stdout = writeStdout,
    stderr = (text) => process.stderr.write(text),
  } = io;
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
      "Usage: node scripts/publish/plan-npm-publish.ts [--tag latest|next] <release-set.tsv>",
    );
  }
  const rows: string[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line === "") continue;
    const [name, version, tgz, ...rest] = line.split("\t");
    if (!name || !version || !tgz || rest.length > 0) {
      throw new Error(`Invalid release-set row ${JSON.stringify(line)}.`);
    }
    if (
      shouldPublish(
        { name, version, tag },
        await fetchRegistryState(name, fetchFn),
      )
    ) {
      rows.push(`${line}\n`);
    } else {
      stderr(`Already on npm: ${name}@${version}\n`);
    }
  }
  stdout(rows.join(""));
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
