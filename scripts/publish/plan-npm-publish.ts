import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { isMain, reportCliError, writeStdout } from "../workflow.ts";
import type { TarballIdentity } from "./read-tarball-identity.ts";
import type { ReleaseChannel } from "./verify-release-set.ts";

/** npm registry URL used by release planning and version visibility checks. */
export const REGISTRY = "https://registry.npmjs.org";

/** A maintainer's explicit hold on a package's latest tag. */
export interface RollbackPin {
  /** Published stable version latest must keep pointing to. */
  readonly version: string;
  /** Why automatic promotion is suspended. */
  readonly reason: string;
}

/** Validates the committed rollback configuration before any registry operations. */
export function parseRollbackPins(
  value: unknown,
): ReadonlyMap<string, RollbackPin> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error(
      "npm rollback pins must be an object keyed by package name.",
    );
  }
  const pins = new Map<string, RollbackPin>();
  for (const [name, raw] of Object.entries(value)) {
    if (
      !/^@morpho-org\/[a-z0-9][a-z0-9._-]*$/.test(name) ||
      typeof raw !== "object" ||
      raw == null ||
      Array.isArray(raw)
    ) {
      throw new Error(`Invalid npm rollback pin for ${name}.`);
    }
    const pin = raw as Record<string, unknown>;
    if (
      Object.keys(pin).some((key) => key !== "version" && key !== "reason") ||
      typeof pin.version !== "string" ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pin.version) ||
      typeof pin.reason !== "string" ||
      pin.reason.trim() === ""
    ) {
      throw new Error(
        `Rollback pin for ${name} needs a stable version and a non-empty reason, with no other fields.`,
      );
    }
    pins.set(name, { version: pin.version, reason: pin.reason });
  }
  return pins;
}

/** What npm already holds for a package. */
export interface RegistryState {
  /** Versions currently on the registry. */
  readonly versions: readonly string[];
  /** Versions ever published, including unpublished ones npm refuses to reuse. */
  readonly everPublished: readonly string[];
  /** Published tarball integrity by version; missing entries cannot be promoted. */
  readonly integrities: Readonly<Record<string, string>>;
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
 * Plans a publish, a next-to-latest promotion, or a skip. Ambiguous lagging tags,
 * unpublished versions and backward tag moves fail before any mutation.
 *
 * @param tarball - Identity read from the tarball, and the dist-tag it publishes under
 *   (`latest` by default).
 * @param state - Registry state, or `undefined` for a package npm has never seen.
 * @returns The npm operation, or `skip` for an already published or pinned version.
 * @throws If a package without a `latest` version on npm would publish under `next`: npm
 *   would also point `latest` at that prerelease.
 * @throws If a rollback pin disagrees with npm or would hide an unpublished release version.
 * @throws If an existing version is ahead of its channel without an exact next-to-latest match.
 * @throws If a promotion lacks a matching SHA-512 integrity for the verified tarball.
 */
export function planPublish(
  {
    name,
    version,
    tag = "latest",
    pin,
    integrity,
  }: TarballIdentity & {
    readonly tag?: ReleaseChannel;
    readonly pin?: RollbackPin;
    /** SHA-512 SRI of the tarball cleared by verify-release-set.ts. */
    readonly integrity?: string;
  },
  state: RegistryState | undefined,
): "publish" | "promote" | "skip" {
  if (tag === "latest" && pin != null) {
    if (
      state?.latest !== pin.version ||
      !state.versions.includes(pin.version)
    ) {
      throw new Error(
        `Rollback pin for ${name} requires npm latest ${pin.version}, got ${state?.latest ?? "no latest"}. Apply the rollback manually before releasing.`,
      );
    }
    if (!state.versions.includes(version)) {
      throw new Error(
        `${name}@${version} is not on npm and cannot be released while latest is pinned to ${pin.version}. Remove the rollback pin or revert the package version first.`,
      );
    }
    return "skip";
  }
  if (tag === "next" && state?.latest == null) {
    throw new Error(
      `${name}@${version} would be ${name}'s only version on npm, and npm points latest at it whatever --tag says. Publish a stable version from main first.`,
    );
  }
  if (state == null) return "publish";
  const current = state[tag];
  if (state.versions.includes(version)) {
    if (current != null && compareVersions(version, current) > 0) {
      if (
        tag === "latest" &&
        state.next === version &&
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
      ) {
        if (
          integrity == null ||
          !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity) ||
          state.integrities[version] !== integrity
        ) {
          throw new Error(
            `${name}@${version} cannot be promoted: npm's SHA-512 integrity is missing or differs from the verified release tarball. Investigate the published bytes and release a new version if they differ.`,
          );
        }
        return "promote";
      }
      throw new Error(
        `${name}@${version} is already on npm, but ${tag} still points to the older ${current}, so installs keep resolving ${current}. If the tag was left behind, run "npm dist-tag add ${name}@${version} ${tag}" and rerun. If latest was moved back on purpose, record a rollback pin in scripts/publish/npm-tag-rollbacks.json before rerunning main. Otherwise release a new version.`,
      );
    }
    return "skip";
  }
  if (state.everPublished.includes(version)) {
    throw new Error(
      `${name}@${version} was published and then removed; npm refuses to reuse it. Release a new version.`,
    );
  }
  if (current != null && compareVersions(version, current) <= 0) {
    throw new Error(
      `${name}@${version} is not newer than ${tag} ${current}; publishing it would move ${tag} back. Release a new version.`,
    );
  }
  return "publish";
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
    return {
      versions: [],
      everPublished: [...new Set([...listed, ...gone])],
      integrities: {},
    };
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
  const integrities: Record<string, string> = Object.fromEntries(
    Object.entries(versions).flatMap(([version, manifest]) => {
      if (
        typeof manifest !== "object" ||
        manifest == null ||
        !("dist" in manifest)
      )
        return [];
      const dist = manifest.dist;
      return typeof dist === "object" &&
        dist != null &&
        "integrity" in dist &&
        typeof dist.integrity === "string"
        ? [[version, dist.integrity]]
        : [];
    }),
  );
  return {
    versions: Object.keys(versions),
    integrities,
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
 * to publish under that dist-tag (default `latest`), in the same format. Writes
 * next-to-latest promotions as `<name>\t<version>` to --promotions, if supplied.
 *
 * Each tarball must remain available; promotions require its SHA-512 to match npm.
 * Skipped rows are reported on stderr.
 * When `--already-published-output <path>` is given, skipped rows already on npm are also
 * written to that path in the same `<name>\t<version>\t<file>` format.
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
    options: {
      tag: { type: "string", default: "latest" },
      promotions: { type: "string" },
      "already-published-output": { type: "string" },
      rollbacks: {
        type: "string",
        default: fileURLToPath(
          new URL("./npm-tag-rollbacks.json", import.meta.url),
        ),
      },
    },
  });
  const [file] = positionals;
  const { tag } = values;
  const alreadyPublishedOutput = values["already-published-output"];
  if (
    !file ||
    !values.rollbacks ||
    positionals.length !== 1 ||
    (tag !== "latest" && tag !== "next")
  ) {
    throw new Error(
      "Usage: node scripts/publish/plan-npm-publish.ts [--tag latest|next] [--promotions <file>] [--rollbacks <file>] [--already-published-output <path>] <release-set.tsv>",
    );
  }
  const rows: string[] = [];
  const alreadyPublishedRows: string[] = [];
  const promotions: string[] = [];
  const pins = parseRollbackPins(
    JSON.parse(readFileSync(values.rollbacks, "utf8")),
  );
  const names = new Set<string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line === "") continue;
    const [name, version, tgz, ...rest] = line.split("\t");
    if (!name || !version || !tgz || rest.length > 0) {
      throw new Error(`Invalid release-set row ${JSON.stringify(line)}.`);
    }
    names.add(name);
    const pin = tag === "latest" ? pins.get(name) : undefined;
    const operation = planPublish(
      {
        name,
        version,
        tag,
        pin,
        integrity: `sha512-${createHash("sha512").update(readFileSync(tgz)).digest("base64")}`,
      },
      await fetchRegistryState(name, fetchFn),
    );
    if (operation === "publish") {
      rows.push(`${line}\n`);
    } else if (operation === "promote") {
      alreadyPublishedRows.push(`${line}\n`);
      promotions.push(`${name}\t${version}\n`);
    } else {
      alreadyPublishedRows.push(`${line}\n`);
      stderr(
        pin == null
          ? `Already on npm: ${name}@${version}\n`
          : `Rollback hold: ${name} latest stays at ${pin.version}: ${pin.reason}\n`,
      );
    }
  }
  if (tag === "latest") {
    for (const name of pins.keys()) {
      if (!names.has(name))
        throw new Error(
          `Rollback pin for ${name} does not match a package in this release.`,
        );
    }
  }
  if (promotions.length > 0 && values.promotions == null) {
    throw new Error(
      "Pass --promotions <file> to plan next-to-latest promotions without republishing.",
    );
  }
  if (values.promotions != null)
    writeFileSync(values.promotions, promotions.join(""));
  if (alreadyPublishedOutput != null)
    writeFileSync(alreadyPublishedOutput, alreadyPublishedRows.join(""));
  stdout(rows.join(""));
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
