/**
 * Deterministic dependency-discovery dispatcher.
 *
 * Runs on a schedule from `.github/workflows/dependency-discovery.yml`. It scans the workspace
 * manifests (`package.json` files plus `catalog:`/`overrides:` in `pnpm-workspace.yaml`) and the
 * pinned GitHub Actions in `.github/workflows/`, applies SemVer and the pnpm `minimumReleaseAge`
 * gate, dedupes against open PRs and existing `devin/` branches, and POSTs one webhook event per
 * qualifying bump to the Devin automation behind `DEVIN_DEPENDENCY_WEBHOOK_URL`. Discovery is fully
 * deterministic — no Devin session is involved until an event is dispatched.
 *
 *   node scripts/ci/dependency-discovery.ts [--dry-run]
 *
 * `--dry-run` prints the events as JSON lines instead of POSTing them.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { gt, minVersion, valid } from "semver";

import { isMain, readRequiredEnv, reportCliError } from "./workflow.ts";

/** Dependency ecosystem a bump event belongs to. */
export type Ecosystem = "npm" | "github-actions";

/** One dispatched dependency bump, consumed by the Devin automation webhook. */
export interface BumpEvent {
  readonly kind: "dependency_update";
  readonly ecosystem: Ecosystem;
  readonly package: string;
  readonly from: string;
  readonly to: string;
  /** ISO-8601 publication timestamp of the target version. */
  readonly publishDate: string;
  readonly ageGate: "satisfied";
  /** Manifest files where the dependency is declared. */
  readonly targets: readonly string[];
  /** Resolved commit SHA of the target release (actions only). */
  readonly sha?: string;
  readonly security: null;
}

/** A manifest file read by the caller and handed to the pure collectors. */
export interface SourceFile {
  readonly path: string;
  readonly content: string;
}

/** Injectable `fetch` surface (a subset of the global) so tests never hit the network. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// `peerDependencies` are intentionally excluded: Dependabot does not bump peer ranges, and the
// Devin bump session widens them itself when a new major requires it (AGENTS.md §4).
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
] as const;

const SKIPPED_SPEC =
  /^(?:workspace:|catalog:|link:|file:|git\+|https?:|github:)/;

/**
 * Reads the top-level `minimumReleaseAge:` setting (in minutes) from `pnpm-workspace.yaml` content.
 * Defaults to 0 (no age gate) when the key is absent.
 */
export function readMinimumReleaseAgeMinutes(workspaceYaml: string): number {
  const match = /^minimumReleaseAge:\s*(\d+)\s*$/m.exec(workspaceYaml);
  return match?.[1] != null ? Number.parseInt(match[1], 10) : 0;
}

/**
 * Collects npm dependency specs across the workspace: every `package.json` handed in (typically
 * the root plus `packages/<pkg>/package.json`), plus `catalog:` and `overrides:` entries in
 * `pnpm-workspace.yaml` (targeted as `"pnpm-workspace.yaml"`). `peerDependencies`, `workspace:`,
 * `catalog:`, `link:`, `file:` and git/URL specs are skipped. The same package under different specs yields separate
 * entries keyed `name@spec`, so each resolvable range produces its own bump event.
 */
export function collectNpmDependencies(
  files: readonly SourceFile[],
  workspaceYaml: string,
): Map<string, { spec: string; targets: string[] }> {
  const deps = new Map<string, { spec: string; targets: string[] }>();

  const add = ({
    name,
    spec,
    target,
  }: {
    name: string;
    spec: string;
    target: string;
  }) => {
    if (SKIPPED_SPEC.test(spec)) return;
    const key = `${name}@${spec}`;
    const entry = deps.get(key);
    if (entry == null) {
      deps.set(key, { spec, targets: [target] });
    } else if (!entry.targets.includes(target)) {
      entry.targets.push(target);
    }
  };

  for (const file of files) {
    const manifest = JSON.parse(file.content) as Record<string, unknown>;
    for (const field of DEPENDENCY_FIELDS) {
      const section = manifest[field];
      if (section == null || typeof section !== "object") continue;
      for (const [name, spec] of Object.entries(
        section as Record<string, unknown>,
      )) {
        if (typeof spec === "string") add({ name, spec, target: file.path });
      }
    }
  }

  let section: "catalog" | "overrides" | null = null;
  for (const line of workspaceYaml.split("\n")) {
    const topLevel = /^(\w[\w-]*):/.exec(line);
    if (topLevel != null) {
      section =
        topLevel[1] === "catalog" || topLevel[1] === "overrides"
          ? topLevel[1]
          : null;
      continue;
    }
    if (section == null) continue;
    const entry =
      /^\s+['"]?([^'":\s][^'":]*)['"]?:\s*['"]?([^'"#\s]+)['"]?\s*$/.exec(line);
    if (entry?.[1] != null && entry[2] != null) {
      add({ name: entry[1], spec: entry[2], target: "pnpm-workspace.yaml" });
    }
  }

  return deps;
}

/**
 * Picks the bump target for an npm spec: the highest stable version strictly greater than the
 * spec's current minimum (`semver.minVersion`) whose publish time is at least `minAgeMinutes`
 * old. Majors are allowed (Dependabot-style). Returns `null` when nothing qualifies or the
 * resolved candidate equals the current minimum.
 */
export function selectNpmTarget(
  spec: string,
  {
    versions,
    now,
    minAgeMinutes,
  }: {
    versions: Readonly<Record<string, string>>;
    now: Date;
    minAgeMinutes: number;
  },
): { to: string; publishDate: string } | null {
  let current: ReturnType<typeof minVersion>;
  try {
    current = minVersion(spec);
  } catch {
    return null;
  }
  if (current == null) return null;

  const cutoff = now.getTime() - minAgeMinutes * 60_000;
  let best: string | null = null;
  for (const [version, time] of Object.entries(versions)) {
    const parsed = valid(version);
    if (parsed == null || version.includes("-")) continue;
    if (!gt(version, current.version)) continue;
    const published = Date.parse(time);
    if (Number.isNaN(published) || published > cutoff) continue;
    if (best == null || gt(version, best)) best = version;
  }

  return best == null ? null : { to: best, publishDate: versions[best] ?? "" };
}

/**
 * Extracts commit-SHA-pinned action references (`uses: owner/repo[/sub]@<40-hex> # vX.Y.Z`) from
 * workflow file contents, keyed `owner/repo`. Local (`./…`) and `docker://` uses are ignored.
 * `targets` lists the workflow files referencing the action.
 */
export function parseActionPins(workflows: readonly SourceFile[]): Map<
  string,
  {
    owner: string;
    repo: string;
    sha: string;
    version: string;
    targets: string[];
  }
> {
  const pins = new Map<
    string,
    {
      owner: string;
      repo: string;
      sha: string;
      version: string;
      targets: string[];
    }
  >();
  const pattern =
    /uses:\s*["']?([\w.-]+)\/([\w.-]+)(?:\/[\w./-]+)?@([0-9a-f]{40})\s*#\s*(v?\d+\.\d+\.\d+\S*)/g;

  for (const file of workflows) {
    for (const match of file.content.matchAll(pattern)) {
      const [, owner, repo, sha, version] = match;
      if (owner == null || repo == null || sha == null || version == null) {
        continue;
      }
      const key = `${owner}/${repo}`;
      const existing = pins.get(key);
      if (existing == null) {
        pins.set(key, {
          owner,
          repo,
          sha,
          version,
          targets: [file.path],
        });
      } else {
        if (gt(valid(version) ?? "0.0.0", valid(existing.version) ?? "0.0.0")) {
          existing.sha = sha;
          existing.version = version;
        }
        if (!existing.targets.includes(file.path)) {
          existing.targets.push(file.path);
        }
      }
    }
  }

  return pins;
}

/** A GitHub release as consumed by {@link selectActionTarget}. */
export interface ActionRelease {
  readonly tag: string;
  readonly publishedAt: string;
  readonly prerelease: boolean;
}

/**
 * Picks the bump target for a pinned action: the highest release tag parsable as SemVer,
 * non-prerelease, strictly greater than `current`, and at least `minAgeMinutes` old. Returns
 * `null` when nothing qualifies.
 */
export function selectActionTarget(
  current: string,
  {
    releases,
    now,
    minAgeMinutes,
  }: {
    releases: readonly ActionRelease[];
    now: Date;
    minAgeMinutes: number;
  },
): { to: string; publishDate: string } | null {
  const currentVersion = valid(current);
  if (currentVersion == null) return null;

  const cutoff = now.getTime() - minAgeMinutes * 60_000;
  let best: { tag: string; publishedAt: string } | null = null;
  for (const release of releases) {
    if (release.prerelease) continue;
    const parsed = valid(release.tag);
    if (parsed == null || !gt(parsed, currentVersion)) continue;
    const published = Date.parse(release.publishedAt);
    if (Number.isNaN(published) || published > cutoff) continue;
    if (best == null || gt(parsed, valid(best.tag) ?? "0.0.0")) {
      best = release;
    }
  }

  return best == null ? null : { to: best.tag, publishDate: best.publishedAt };
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Slug used in `devin/*-bump-<slug>-<to>` branch names (`@` and `/` become `-`). */
export function branchSlug(packageName: string): string {
  return packageName.replace(/[@/]/g, "-");
}

/**
 * Whether an equivalent bump is already in flight: an open PR title of the form
 * `bump <package> from <from> to <to>` (case-insensitive; containing the package and the target
 * version is enough) or an existing branch `devin/*-bump-<slug>-<to>`.
 */
export function isDuplicate(
  event: BumpEvent,
  {
    openPrTitles,
    branches,
  }: {
    openPrTitles: readonly string[];
    branches: readonly string[];
  },
): boolean {
  const titlePattern = new RegExp(
    `bump.*${escapeRegExp(event.package)}.*${escapeRegExp(event.to)}`,
    "i",
  );
  if (openPrTitles.some((title) => titlePattern.test(title))) return true;

  const branchPattern = new RegExp(
    `^devin/.*-bump-${escapeRegExp(branchSlug(event.package))}-${escapeRegExp(
      event.to,
    )}$`,
  );
  return branches.some((branch) => branchPattern.test(branch));
}

/** Composes a {@link BumpEvent} from its parts. */
export function buildBumpEvent(fields: {
  readonly ecosystem: Ecosystem;
  readonly package: string;
  readonly from: string;
  readonly to: string;
  readonly publishDate: string;
  readonly targets: readonly string[];
  readonly sha?: string;
}): BumpEvent {
  return {
    kind: "dependency_update",
    ageGate: "satisfied",
    security: null,
    ...fields,
  };
}

/**
 * POSTs one bump event to the Devin automation webhook. Throws on a non-2xx response, with the
 * HTTP status in the message; the webhook secret is never echoed.
 */
export async function dispatch(
  event: BumpEvent,
  {
    url,
    secret,
    fetch: fetchImpl,
  }: { url: string; secret: string; fetch: FetchLike },
): Promise<void> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": secret,
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    throw new Error(
      `Webhook dispatch for ${event.package}@${event.to} failed with status ${response.status}.`,
    );
  }
}

/**
 * Merges bump events that target the same `ecosystem + package + to` version — e.g. one package
 * declared under different specs in several manifests — into a single event whose `targets` are
 * the sorted union and whose `from` is the lowest SemVer `from` among the merged events.
 */
export function mergeBumpEvents(events: readonly BumpEvent[]): BumpEvent[] {
  const merged = new Map<string, BumpEvent>();
  for (const event of events) {
    const key = `${event.ecosystem}\0${event.package}\0${event.to}`;
    const existing = merged.get(key);
    if (existing == null) {
      merged.set(key, event);
      continue;
    }
    const targets = [
      ...new Set([...existing.targets, ...event.targets]),
    ].sort();
    const from =
      valid(event.from) != null &&
      (valid(existing.from) == null || gt(existing.from, event.from))
        ? event.from
        : existing.from;
    merged.set(key, { ...existing, from, targets });
  }

  return [...merged.values()];
}

const REPO = "morpho-org/sdks";

interface GitHubRef {
  readonly object: { readonly sha: string; readonly type: string };
}

/** Resolves a release tag to its commit SHA, dereferencing annotated tag objects. */
async function resolveTagSha({
  owner,
  repo,
  tag,
  fetchImpl,
  headers,
}: {
  owner: string;
  repo: string;
  tag: string;
  fetchImpl: FetchLike;
  headers: Record<string, string>;
}): Promise<string> {
  const refResponse = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/tags/${tag}`,
    { headers },
  );
  if (!refResponse.ok) {
    throw new Error(
      `Failed to resolve tag ${tag} for ${owner}/${repo} (status ${refResponse.status}).`,
    );
  }
  const ref = (await refResponse.json()) as GitHubRef;
  if (ref.object.type !== "tag") return ref.object.sha;

  const tagResponse = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/git/tags/${ref.object.sha}`,
    { headers },
  );
  if (!tagResponse.ok) {
    throw new Error(
      `Failed to dereference annotated tag ${tag} for ${owner}/${repo} (status ${tagResponse.status}).`,
    );
  }
  const tagObject = (await tagResponse.json()) as GitHubRef;
  return tagObject.object.sha;
}

function readWorkspaceFiles(rootDir: string): {
  workspaceYaml: string;
  packageJsonFiles: SourceFile[];
  workflowFiles: SourceFile[];
} {
  const workspaceYaml = readFileSync(
    join(rootDir, "pnpm-workspace.yaml"),
    "utf8",
  );
  const packageJsonFiles: SourceFile[] = [
    {
      path: "package.json",
      content: readFileSync(join(rootDir, "package.json"), "utf8"),
    },
  ];
  for (const dir of readdirSync(join(rootDir, "packages"), {
    withFileTypes: true,
  })) {
    if (!dir.isDirectory()) continue;
    const path = join("packages", dir.name, "package.json");
    try {
      packageJsonFiles.push({
        path,
        content: readFileSync(join(rootDir, path), "utf8"),
      });
    } catch {
      // Directories without a package.json are not workspace packages.
    }
  }
  const workflowDir = join(rootDir, ".github", "workflows");
  const workflowFiles: SourceFile[] = readdirSync(workflowDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => ({
      path: join(".github", "workflows", name),
      content: readFileSync(join(workflowDir, name), "utf8"),
    }));

  return { workspaceYaml, packageJsonFiles, workflowFiles };
}

export interface MainOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetch?: FetchLike;
  readonly now?: Date;
  readonly log?: (message: string) => void;
  readonly dryRun?: boolean;
  readonly rootDir?: string;
}

/**
 * Discovery entry point: collects npm + GitHub Actions candidates, applies the release-age gate,
 * dedupes against open PRs and `devin/` branches, and dispatches (or prints, under `--dry-run`) up
 * to `MAX_DISPATCH_PER_RUN` (default 10) events, oldest publish date first.
 */
export async function main(options: MainOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? (fetch as unknown as FetchLike);
  const now = options.now ?? new Date();
  const log = options.log ?? console.log;
  const dryRun = options.dryRun ?? false;
  const rootDir = options.rootDir ?? ".";

  const ghToken = readRequiredEnv(env, "GH_TOKEN");
  const url = dryRun
    ? ""
    : readRequiredEnv(env, "DEVIN_DEPENDENCY_WEBHOOK_URL");
  const secret = dryRun
    ? ""
    : readRequiredEnv(env, "DEVIN_DEPENDENCY_WEBHOOK_SECRET");
  const maxDispatch = Number.parseInt(env.MAX_DISPATCH_PER_RUN ?? "10", 10);

  const { workspaceYaml, packageJsonFiles, workflowFiles } =
    readWorkspaceFiles(rootDir);
  const minAgeMinutes = readMinimumReleaseAgeMinutes(workspaceYaml);
  const githubHeaders = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${ghToken}`,
  };

  const events: BumpEvent[] = [];

  const npmDeps = collectNpmDependencies(packageJsonFiles, workspaceYaml);
  const metadataCache = new Map<string, Record<string, string>>();
  for (const [key, dep] of npmDeps) {
    const pkgName = key.substring(0, key.lastIndexOf("@"));
    let versions = metadataCache.get(pkgName);
    if (versions == null) {
      const response = await fetchImpl(
        `https://registry.npmjs.org/${encodeURIComponent(pkgName)}`,
        {},
      );
      if (!response.ok) {
        log(
          `::notice::skipping ${key}: npm metadata request failed with status ${response.status}`,
        );
        continue;
      }
      const metadata = (await response.json()) as {
        time?: Record<string, string>;
      };
      versions = {};
      for (const [version, time] of Object.entries(metadata.time ?? {})) {
        if (version !== "created" && version !== "modified") {
          versions[version] = time;
        }
      }
      metadataCache.set(pkgName, versions);
    }
    const target = selectNpmTarget(dep.spec, {
      versions,
      now,
      minAgeMinutes,
    });
    if (target == null) continue;
    const from = minVersion(dep.spec)?.version;
    if (from == null) continue;
    events.push(
      buildBumpEvent({
        ecosystem: "npm",
        package: pkgName,
        from,
        to: target.to,
        publishDate: target.publishDate,
        targets: dep.targets,
      }),
    );
  }

  const pins = parseActionPins(workflowFiles);
  for (const [key, pin] of pins) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${pin.owner}/${pin.repo}/releases?per_page=30`,
      { headers: githubHeaders },
    );
    if (!response.ok) {
      log(
        `::notice::skipping ${key}: releases request failed with status ${response.status}`,
      );
      continue;
    }
    const releases = (await response.json()) as ReadonlyArray<{
      tag_name: string;
      published_at: string | null;
      prerelease: boolean;
    }>;
    const target = selectActionTarget(pin.version, {
      releases: releases.map((release) => ({
        tag: release.tag_name,
        publishedAt: release.published_at ?? "",
        prerelease: release.prerelease,
      })),
      now,
      minAgeMinutes,
    });
    if (target == null) continue;
    const sha = await resolveTagSha({
      owner: pin.owner,
      repo: pin.repo,
      tag: target.to,
      fetchImpl,
      headers: githubHeaders,
    });
    events.push(
      buildBumpEvent({
        ecosystem: "github-actions",
        package: key,
        from: pin.version,
        to: target.to,
        publishDate: target.publishDate,
        targets: pin.targets,
        sha,
      }),
    );
  }

  const [openPrs, branchRefs] = await Promise.all([
    fetchImpl(
      `https://api.github.com/repos/${REPO}/pulls?state=open&per_page=100`,
      { headers: githubHeaders },
    ),
    fetchImpl(
      `https://api.github.com/repos/${REPO}/git/matching-refs/heads/devin/`,
      { headers: githubHeaders },
    ),
  ]);
  const openPrTitles = openPrs.ok
    ? ((await openPrs.json()) as ReadonlyArray<{ title: string }>).map(
        (pr) => pr.title,
      )
    : [];
  const branches = branchRefs.ok
    ? ((await branchRefs.json()) as ReadonlyArray<{ ref: string }>).map((ref) =>
        ref.ref.replace(/^refs\/heads\//, ""),
      )
    : [];

  const fresh = mergeBumpEvents(events).filter(
    (event) => !isDuplicate(event, { openPrTitles, branches }),
  );
  fresh.sort((a, b) => Date.parse(a.publishDate) - Date.parse(b.publishDate));

  let dispatched = 0;
  for (const event of fresh) {
    if (dispatched >= maxDispatch) {
      log(
        `::notice::skipped ${event.package} ${event.from} -> ${event.to}: MAX_DISPATCH_PER_RUN reached`,
      );
      continue;
    }
    if (dryRun) {
      log(JSON.stringify(event));
    } else {
      await dispatch(event, { url, secret, fetch: fetchImpl });
      log(
        `::notice::dispatched ${event.ecosystem} bump ${event.package} ${event.from} -> ${event.to}`,
      );
    }
    dispatched += 1;
  }
}

if (isMain(import.meta.url)) {
  try {
    await main({ dryRun: process.argv.includes("--dry-run") });
  } catch (error: unknown) {
    reportCliError(error);
  }
}
