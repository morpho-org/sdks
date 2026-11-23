import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { getErrorMessage, sanitizeLogLine } from "./publish/helpers.ts";
import { isMain } from "./workflow.ts";

const identityPattern =
  /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Checks the name and exact version syntax of an npm registry identity.
 * @param identity - The package name and version separated by an at sign.
 * @returns Whether the identity has the supported npm syntax.
 * @example isRegistryIdentity("@scope/package@1.0.0");
 */
export function isRegistryIdentity(identity: string): boolean {
  return identityPattern.test(identity);
}

/**
 * Reads JSONC without executing the lockfile.
 *
 * @param source - The JSONC lockfile text.
 * @returns The parsed lockfile object.
 * @example parseLockfile('{"packages": {}}');
 */
export function parseLockfile(source: string): Record<string, unknown> {
  const withoutComments = source.replace(
    /"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    (token) => (token.startsWith('"') ? token : " "),
  );
  const json = withoutComments.replace(
    /"(?:\\.|[^"\\])*"|,\s*(?=[}\]])/g,
    (token) => (token.startsWith('"') ? token : ""),
  );
  return record(JSON.parse(json));
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a metadata object.");
  return value as Record<string, unknown>;
}

/**
 * Extracts unique default-registry identities, excluding local workspace links.
 *
 * @param source - The Bun lockfile text.
 * @returns Unique registry package versions.
 * @example registryIdentities('{"packages": {}}');
 */
export function registryIdentities(source: string): Set<string> {
  const packages = record(parseLockfile(source).packages);
  const identities = new Set<string>();
  for (const entry of Object.values(packages)) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string")
      throw new Error("Invalid Bun package entry.");
    const identity: string = entry[0];
    if (/^[^\s]+@workspace:/.test(identity)) continue;
    if (!isRegistryIdentity(identity))
      throw new Error(`Unsupported locked identity: ${identity}`);
    if (entry[1] !== "")
      throw new Error(
        `Non-registry resolution source for locked identity: ${identity}`,
      );
    identities.add(identity);
  }
  return identities;
}

/**
 * Reads registry identities from the pre-migration lockfile's packages section.
 *
 * @param source - The historical pnpm lockfile text.
 * @returns Unique registry package versions.
 * @example legacyIdentities("packages:\n  example@1.0.0: {}\n");
 */
export function legacyIdentities(source: string): Set<string> {
  const section = source.match(
    /^packages:\s*\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m,
  )?.[1];
  if (section === undefined)
    throw new Error("Missing legacy packages section.");
  const identities = new Set<string>();
  for (const line of section.split("\n")) {
    if (!/^ {2}\S/.test(line)) continue;
    const identity = line
      .trim()
      .replace(/:$/, "")
      .replace(/^['"]|['"]$/g, "");
    if (!isRegistryIdentity(identity))
      throw new Error(`Unsupported legacy identity: ${identity}`);
    identities.add(identity);
  }
  return identities;
}

/**
 * Reads the positive seconds threshold from the install section, failing closed.
 *
 * @param source - The bunfig.toml text.
 * @returns The minimum publication age in seconds.
 * @example minimumReleaseAge("[install]\nminimumReleaseAge = 259200\n");
 */
export function minimumReleaseAge(source: string): number {
  const section = source.match(
    /^\[install\][^\n]*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m,
  )?.[1];
  const values = [
    ...(section ?? "").matchAll(/^minimumReleaseAge\s*=\s*(\d+)\s*(?:#.*)?$/gm),
  ];
  const seconds = Number(values[0]?.[1]);
  if (values.length !== 1 || !Number.isSafeInteger(seconds) || seconds <= 0)
    throw new Error(
      "Expected a positive install.minimumReleaseAge in seconds.",
    );
  return seconds;
}

/**
 * Reads reviewed exact-version exceptions independently of Bun's name-wide exclusions.
 *
 * @param source - The JSON exception list.
 * @returns Reviewed exact-version identities.
 * @example releaseAgeExceptions('["example@1.0.0"]');
 */
export function releaseAgeExceptions(source: string): ReadonlySet<string> {
  const identities: unknown = JSON.parse(source);
  if (
    !Array.isArray(identities) ||
    !identities.every((identity: unknown) => {
      if (typeof identity !== "string" || !isRegistryIdentity(identity))
        return false;
      const version = identity.slice(identity.lastIndexOf("@") + 1);
      return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
        version,
      );
    })
  )
    throw new Error(
      "Release-age exceptions must be exact name@version identities, not bare names, ranges or patterns.",
    );
  return new Set<string>(identities);
}

/**
 * Requires valid timestamps, then enforces age unless the exact identity has an exception.
 *
 * @param options - Identity, publication timestamp, age threshold and exception status.
 * @returns Nothing; throws when timestamp or age validation fails.
 * @example assertReleaseAge({ identity: "example@1.0.0", timestamp: "2020-01-01", seconds: 259200, now: Date.UTC(2021, 0, 1) });
 */
export function assertReleaseAge({
  identity,
  timestamp,
  seconds,
  now,
  excluded = false,
}: {
  readonly identity: string;
  readonly timestamp: unknown;
  readonly seconds: number;
  readonly now: number;
  readonly excluded?: boolean;
}): void {
  const published = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(published))
    throw new Error(`${identity}: missing or invalid publication timestamp.`);
  if (!excluded && now - published < seconds * 1000)
    throw new Error(
      `${identity}: publication age is less than ${seconds} seconds.`,
    );
}

/**
 * Checks only added registry identities; injectable registry access keeps tests offline.
 *
 * @param options - Current and previous identities, age policy and registry reader.
 * @returns The number of newly added identities checked.
 * @example await checkReleaseAges({ current: new Set(), previous: new Set(), seconds: 259200, now: 0, fetchMetadata: async () => ({}) });
 */
export async function checkReleaseAges({
  current,
  previous,
  seconds,
  now,
  fetchMetadata,
  exceptions = new Set<string>(),
}: {
  readonly current: ReadonlySet<string>;
  readonly previous: ReadonlySet<string>;
  readonly seconds: number;
  readonly now: number;
  readonly fetchMetadata: (name: string) => Promise<unknown>;
  readonly exceptions?: ReadonlySet<string>;
}): Promise<number> {
  const packages = new Map<string, string[]>();
  for (const identity of [...current]
    .filter((item) => !previous.has(item))
    .sort()) {
    const separator = identity.lastIndexOf("@");
    const name = identity.slice(0, separator);
    const identities = packages.get(name) ?? [];
    identities.push(identity);
    packages.set(name, identities);
  }
  const pending = packages.entries();
  let checked = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, packages.size) }, async () => {
      for (const [name, identities] of pending) {
        const metadata = record(await fetchMetadata(name));
        const time = metadata.time === undefined ? {} : record(metadata.time);
        for (const identity of identities) {
          const version = identity.slice(identity.lastIndexOf("@") + 1);
          assertReleaseAge({
            identity,
            timestamp: time[version],
            seconds,
            now,
            excluded: exceptions.has(identity),
          });
          checked++;
        }
      }
    }),
  );
  return checked;
}

/**
 * Fetches npm metadata with four attempts for network errors, rate limits and server errors.
 *
 * @param name - The registry package name.
 * @param options - Injectable HTTP and backoff boundaries.
 * @returns Parsed metadata; malformed data and permanent HTTP failures are not retried.
 * @example await fetchRegistryMetadata("typescript");
 */
export async function fetchRegistryMetadata(
  name: string,
  {
    fetchImpl = fetch,
    wait = (milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  }: {
    readonly fetchImpl?: typeof fetch;
    readonly wait?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(
        `https://registry.npmjs.org/${encodeURIComponent(name)}`,
        {
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (response.ok) return await response.json();
    } catch (error) {
      if (error instanceof SyntaxError || attempt === 3) throw error;
      await wait(250 * 2 ** attempt);
      continue;
    }
    await response.body?.cancel();
    if (
      attempt === 3 ||
      (response.status !== 429 &&
        !(response.status >= 500 && response.status <= 599))
    ) {
      throw new Error(`Registry lookup for ${name} failed: ${response.status}`);
    }
    await wait(250 * 2 ** attempt);
  }
}

/**
 * Compares against the merge base, falling back to its pre-migration registry graph.
 *
 * @param baseRef - The Git reference used to find the merge base, or --all to validate every locked identity before install.
 * @param lockfile - The current Bun lockfile path.
 * @returns Resolves after validating new identities and printing their count.
 * @example await main("origin/main");
 */
export async function main(
  baseRef: string,
  lockfile = "bun.lock",
): Promise<void> {
  if (!baseRef)
    throw new Error(
      "Usage: node scripts/check-release-age.ts <base-ref|--all> [lockfile]",
    );
  const git = (args: string[]) =>
    execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  let previous = new Set<string>();
  if (baseRef !== "--all") {
    const base = git(["merge-base", "HEAD", baseRef]).trim();
    const files = git(["ls-tree", "--name-only", base]).split("\n");
    previous = files.includes("bun.lock")
      ? registryIdentities(git(["show", `${base}:bun.lock`]))
      : legacyIdentities(git(["show", `${base}:pnpm-lock.yaml`]));
  }
  const config = readFileSync("bunfig.toml", "utf8");
  const checked = await checkReleaseAges({
    current: registryIdentities(readFileSync(lockfile, "utf8")),
    previous,
    seconds: minimumReleaseAge(config),
    exceptions: releaseAgeExceptions(
      readFileSync("release-age-exceptions.json", "utf8"),
    ),
    now: Date.now(),
    fetchMetadata: fetchRegistryMetadata,
  });
  console.log(`Release age: checked ${checked} new identities.`);
}

if (isMain(import.meta.url)) {
  main(process.argv[2] ?? "", process.argv[3]).catch((error) => {
    console.error(sanitizeLogLine(getErrorMessage(error)));
    process.exitCode = 1;
  });
}
