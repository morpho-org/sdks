#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { getErrorMessage, sanitizeLogLine } from "./helpers.ts";

// These verification values intentionally remain constants, not runtime options.
const EXPECTED = {
  repository: "https://github.com/morpho-org/sdks",
  repositoryId: "829304716",
  workflowPath: ".github/workflows/push.yml",
  refs: ["refs/heads/main", "refs/heads/next"],
  builder: "https://github.com/actions/runner/github-hosted",
  event: "push",
  githubRepository: "morpho-org/sdks",
  registry: "https://registry.npmjs.org",
} as const;

const SLSA_PREDICATE_TYPE = "https://slsa.dev/provenance/v1";
const SEVERITY_RANK: Record<Severity, number> = {
  PASS: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/** Severity levels used in npm release verification reports. */
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "PASS";

interface VerificationCheck {
  id: string;
  status: "pass" | "fail" | "error";
  detail: string;
}

interface VerificationFinding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

/** The deterministic result of verifying a published npm release. */
interface NpmReleaseReport {
  package: string;
  version: string;
  previousVersion: string | null;
  gitCommit: string | null;
  severity: Severity;
  checks: VerificationCheck[];
  findings: VerificationFinding[];
}

interface RegistryManifest {
  name?: string;
  version?: string;
  private?: boolean;
  dist?: {
    integrity?: string;
    tarball?: string;
    attestations?: { url?: string };
  };
  _npmUser?: { trustedPublisher?: { id?: string } };
  scripts?: Record<string, string>;
  gypfile?: boolean;
  bin?: string | Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  files?: unknown;
  repository?: { url?: string } | string;
  license?: string;
}

interface Packument {
  versions?: Record<string, RegistryManifest>;
  time?: Record<string, string>;
}

interface Attestation {
  predicateType?: string;
  bundle?: { dsseEnvelope?: { payload?: string } };
}

interface ProvenancePredicate {
  buildDefinition?: {
    externalParameters?: {
      workflow?: {
        ref?: string;
        repository?: string;
        path?: string;
      };
    };
    internalParameters?: {
      github?: { event_name?: string; repository_id?: string };
    };
    resolvedDependencies?: { digest?: { gitCommit?: string } }[];
  };
  runDetails?: { builder?: { id?: string } };
}

interface ProvenanceStatement extends ProvenancePredicate {
  subject?: { digest?: { sha512?: string } }[];
  predicate?: ProvenancePredicate;
}

interface PackageSource {
  directory: string;
  manifest: RegistryManifest;
}

interface ProvenanceEvaluation {
  checks: VerificationCheck[];
  findings: VerificationFinding[];
  gitCommit: string | null;
}

/**
 * Converts a sha512 Subresource Integrity value to its lowercase hexadecimal digest.
 *
 * @param integrity The registry integrity value.
 * @returns The digest in hexadecimal, or null for a malformed value.
 */
export function integrityToSha512Hex(integrity: string): string | null {
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);
  if (match == null) return null;
  const encoded = match[1] ?? "";
  const digest = Buffer.from(encoded, "base64");
  return digest.length === 64 &&
    digest.toString("base64").replace(/=+$/, "") === encoded.replace(/=+$/, "")
    ? digest.toString("hex")
    : null;
}

/**
 * Finds the previous version by publish time, respecting stable and prerelease channels.
 *
 * @param packument The npm metadata for the package.
 * @param version The release version being checked.
 * @returns The immediately preceding eligible version, or null if none exists.
 */
export function selectPreviousVersion(
  packument: Packument,
  version: string,
): string | null {
  const targetTime = Date.parse(packument.time?.[version] ?? "");
  if (!Number.isFinite(targetTime)) return null;
  const includePrereleases = version.includes("-");
  let previous: { version: string; time: number } | undefined;
  for (const [candidate, publishTime] of Object.entries(packument.time ?? {})) {
    if (
      candidate === "created" ||
      candidate === "modified" ||
      candidate === version ||
      packument.versions?.[candidate] == null ||
      (!includePrereleases && candidate.includes("-"))
    ) {
      continue;
    }
    const time = Date.parse(publishTime);
    if (
      Number.isFinite(time) &&
      time < targetTime &&
      (previous == null || time > previous.time)
    ) {
      previous = { version: candidate, time };
    }
  }
  return previous?.version ?? null;
}

/**
 * Evaluates provenance attestations against the expected GitHub Actions source.
 *
 * @param attestationsUrl The release manifest's attestations URL, if present.
 * @param attestations Entries returned by the npm attestations endpoint.
 * @param integrity The published package's sha512 integrity.
 * @returns Provenance checks, findings, and the source commit digest.
 */
// biome-ignore lint/complexity/useMaxParams: Keep this pure evaluator's inputs explicit.
export function evaluateProvenance(
  attestationsUrl: string | undefined,
  attestations: readonly Attestation[],
  integrity: string,
): ProvenanceEvaluation {
  const checks: VerificationCheck[] = [];
  const findings: VerificationFinding[] = [];
  const failNoStatement = (options: {
    presentStatus: VerificationCheck["status"];
    presentSeverity: Severity;
    presentDetail: string;
    unavailableDetail: string;
  }): ProvenanceEvaluation => {
    addResult(
      checks,
      findings,
      "provenance.present",
      "SLSA provenance is present",
      options.presentStatus,
      options.presentSeverity,
      options.presentDetail,
    );
    addResult(
      checks,
      findings,
      "provenance.subject",
      "Provenance subject matches package integrity",
      "error",
      "HIGH",
      options.unavailableDetail,
    );
    addResult(
      checks,
      findings,
      "provenance.source",
      "Provenance identifies the trusted source workflow",
      "error",
      "HIGH",
      options.unavailableDetail,
    );
    return { checks, findings, gitCommit: null };
  };

  if (attestationsUrl == null || attestationsUrl === "") {
    return failNoStatement({
      presentStatus: "fail",
      presentSeverity: "CRITICAL",
      presentDetail: "The published manifest has no attestations URL.",
      unavailableDetail: "No SLSA statement is available to inspect.",
    });
  }

  let statement: ProvenanceStatement | undefined;
  try {
    for (const attestation of attestations) {
      if (attestation.predicateType !== SLSA_PREDICATE_TYPE) continue;
      const payload = attestation.bundle?.dsseEnvelope?.payload;
      if (payload == null) continue;
      statement = JSON.parse(
        Buffer.from(payload, "base64").toString("utf8"),
      ) as ProvenanceStatement;
      break;
    }
  } catch (error) {
    const detail = `Could not decode the SLSA statement: ${getErrorMessage(error)}`;
    return failNoStatement({
      presentStatus: "error",
      presentSeverity: "HIGH",
      presentDetail: detail,
      unavailableDetail: "The SLSA statement could not be decoded.",
    });
  }

  if (statement == null) {
    return failNoStatement({
      presentStatus: "fail",
      presentSeverity: "CRITICAL",
      presentDetail: "The attestations response contains no SLSA v1 statement.",
      unavailableDetail: "No SLSA statement is available to inspect.",
    });
  }

  addResult(
    checks,
    findings,
    "provenance.present",
    "SLSA provenance is present",
    "pass",
    "CRITICAL",
    "The attestations response contains an SLSA v1 statement.",
  );

  const expectedDigest = integrityToSha512Hex(integrity);
  const actualDigest = statement.subject?.[0]?.digest?.sha512;
  const subjectMatches =
    expectedDigest != null &&
    actualDigest?.toLowerCase() === expectedDigest.toLowerCase();
  addResult(
    checks,
    findings,
    "provenance.subject",
    "Provenance subject matches package integrity",
    subjectMatches ? "pass" : "fail",
    "CRITICAL",
    subjectMatches
      ? "The first subject's sha512 digest matches dist.integrity."
      : `Expected subject sha512 ${expectedDigest ?? "(invalid dist.integrity)"}, got ${actualDigest ?? "(missing)"}.`,
  );

  const provenance = statement.predicate ?? statement;
  const workflow = provenance.buildDefinition?.externalParameters?.workflow;
  const github = provenance.buildDefinition?.internalParameters?.github;
  const mismatches: string[] = [];
  if (workflow?.repository !== EXPECTED.repository) {
    mismatches.push(
      `repository expected ${EXPECTED.repository}, got ${workflow?.repository ?? "(missing)"}`,
    );
  }
  if (github?.repository_id !== EXPECTED.repositoryId) {
    mismatches.push(
      `repository_id expected ${EXPECTED.repositoryId}, got ${github?.repository_id ?? "(missing)"}`,
    );
  }
  if (workflow?.path !== EXPECTED.workflowPath) {
    mismatches.push(
      `workflow path expected ${EXPECTED.workflowPath}, got ${workflow?.path ?? "(missing)"}`,
    );
  }
  if (
    !EXPECTED.refs.includes(workflow?.ref as (typeof EXPECTED.refs)[number])
  ) {
    mismatches.push(
      `ref expected ${EXPECTED.refs.join(" or ")}, got ${workflow?.ref ?? "(missing)"}`,
    );
  }
  if (github?.event_name !== EXPECTED.event) {
    mismatches.push(
      `event_name expected ${EXPECTED.event}, got ${github?.event_name ?? "(missing)"}`,
    );
  }
  const builder = provenance.runDetails?.builder?.id;
  if (builder !== EXPECTED.builder) {
    mismatches.push(
      `builder id expected ${EXPECTED.builder}, got ${builder ?? "(missing)"}`,
    );
  }
  const gitCommit =
    provenance.buildDefinition?.resolvedDependencies?.[0]?.digest?.gitCommit ??
    null;
  addResult(
    checks,
    findings,
    "provenance.source",
    "Provenance identifies the trusted source workflow",
    mismatches.length === 0 ? "pass" : "fail",
    "CRITICAL",
    mismatches.length === 0
      ? "Repository, workflow, ref, event, and builder match the expected release pipeline."
      : mismatches.join("; "),
  );
  return { checks, findings, gitCommit };
}

/**
 * Compares published dependency declarations with their source manifest.
 *
 * @param published The npm registry manifest.
 * @param source The package manifest at the attested commit.
 * @returns Human-readable dependency declaration mismatches.
 */
export function compareManifestDependencies(
  published: RegistryManifest,
  source: RegistryManifest,
): string[] {
  const mismatches: string[] = [];
  for (const field of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const) {
    const expected = source[field] ?? {};
    const actual = published[field] ?? {};
    const expectedNames = Object.keys(expected).sort();
    const actualNames = Object.keys(actual).sort();
    if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
      mismatches.push(
        `${field} names expected [${expectedNames.join(", ")}], got [${actualNames.join(", ")}]`,
      );
    }
    for (const name of expectedNames) {
      const expectedSpecifier = expected[name];
      const actualSpecifier = actual[name];
      if (
        actualSpecifier != null &&
        expectedSpecifier != null &&
        !/^(workspace:|catalog:)/.test(expectedSpecifier) &&
        expectedSpecifier !== actualSpecifier
      ) {
        mismatches.push(
          `${field}.${name} expected ${expectedSpecifier}, got ${actualSpecifier}`,
        );
      }
    }
  }
  return mismatches;
}

/**
 * Compares the package identity fields that should remain stable between releases.
 *
 * @param current The target release manifest.
 * @param previous The previous release manifest.
 * @returns Human-readable identity changes.
 */
export function compareManifestIdentity(
  current: RegistryManifest,
  previous: RegistryManifest,
): string[] {
  const mismatches: string[] = [];
  const currentRepository =
    typeof current.repository === "string"
      ? current.repository
      : current.repository?.url;
  const previousRepository =
    typeof previous.repository === "string"
      ? previous.repository
      : previous.repository?.url;
  for (const [field, actual, expected] of [
    ["repository.url", currentRepository, previousRepository],
    ["license", current.license, previous.license],
    ["name", current.name, previous.name],
  ] as const) {
    if (actual !== expected) {
      mismatches.push(
        `${field} changed from ${expected ?? "(missing)"} to ${actual ?? "(missing)"}`,
      );
    }
  }
  return mismatches;
}

/**
 * Lists archive paths outside the package's documented files allowlist.
 *
 * @param entries Tarball paths, including their `package/` root.
 * @param files The source manifest's `files` array.
 * @param nonRegularEntries Tar entries that are not regular files or directories.
 * @returns Unexpected entries and any files patterns this checker cannot interpret.
 */
// biome-ignore lint/complexity/useMaxParams: Keep this pure checker's inputs explicit.
export function checkTarballFiles(
  entries: readonly string[],
  files: unknown,
  nonRegularEntries: readonly string[] = [],
): { unexpected: string[]; error: string | null } {
  if (files != null && !Array.isArray(files)) {
    return {
      unexpected: [],
      error: "The source manifest files field is not an array.",
    };
  }
  const patterns: RegExp[] = [];
  for (const entry of (files ?? []) as unknown[]) {
    if (
      typeof entry !== "string" ||
      entry === "" ||
      entry.startsWith("/") ||
      entry.includes("\\") ||
      entry.split("/").includes("..") ||
      ["[", "]", "{", "}"].some((character) => entry.includes(character)) ||
      entry.startsWith("!")
    ) {
      return {
        unexpected: [],
        error: `Cannot interpret files entry ${JSON.stringify(entry)}.`,
      };
    }
    patterns.push(filePatternToRegExp(entry.replace(/\/+$/, "")));
  }

  const unexpected = [
    ...entries.filter((entry) => {
      const path = entry.replace(/\/+$/, "");
      if (
        path === "package" ||
        path === "package/package.json" ||
        /^package\/(?:readme|license|licence|changelog)[^/]*$/i.test(path)
      ) {
        return false;
      }
      if (!path.startsWith("package/")) return true;
      const relativePath = path.slice("package/".length);
      return !patterns.some(
        (pattern, index) =>
          pattern.test(relativePath) ||
          isDirectoryAllowedByPattern(
            relativePath,
            String((files as unknown[] | null | undefined)?.[index]),
          ),
      );
    }),
    ...nonRegularEntries.map((entry) => `Non-regular tarball entry: ${entry}`),
  ];
  return { unexpected, error: null };
}

/**
 * Returns whether the published manifest contains a non-empty executable bin declaration.
 *
 * @param bin The package manifest's bin value.
 * @returns Whether at least one executable is configured.
 */
export function hasManifestBin(
  bin: RegistryManifest["bin"] | null | undefined,
): boolean {
  return (
    (typeof bin === "string" && bin !== "") ||
    (typeof bin === "object" &&
      bin != null &&
      Object.values(bin).some((path) => path !== ""))
  );
}

/**
 * Creates the report check for the published manifest's bin declaration.
 *
 * @param bin The package manifest's bin value.
 * @returns The check and any finding for the bin declaration.
 */
export function evaluateManifestBin(
  bin: RegistryManifest["bin"] | null | undefined,
): { checks: VerificationCheck[]; findings: VerificationFinding[] } {
  const checks: VerificationCheck[] = [];
  const findings: VerificationFinding[] = [];
  const hasBin = hasManifestBin(bin);
  addResult(
    checks,
    findings,
    "manifest.bin",
    "Package exposes a command-line binary",
    hasBin ? "fail" : "pass",
    "HIGH",
    hasBin
      ? "The published manifest declares at least one bin entry."
      : "The published manifest has no bin entry.",
  );
  return { checks, findings };
}

/**
 * Returns lifecycle install hooks that would execute during a package installation.
 *
 * @param scripts The published manifest's scripts.
 * @returns Install-time lifecycle hook names.
 */
export function findInstallScripts(
  scripts: RegistryManifest["scripts"],
): string[] {
  return ["preinstall", "install", "postinstall"].filter(
    (name) => scripts?.[name] != null,
  );
}

/**
 * Finds scripts or native-addon files that run during npm installation.
 *
 * @param scripts The published manifest's scripts.
 * @param gypfile The published manifest's gypfile declaration.
 * @param entries Tarball paths, including their `package/` root.
 * @returns Install-time execution risks.
 */
// biome-ignore lint/complexity/useMaxParams: Keep this pure checker's inputs explicit.
export function findInstallProblems(
  scripts: RegistryManifest["scripts"],
  gypfile: boolean | undefined,
  entries: readonly string[],
): string[] {
  const hooks = findInstallScripts(scripts);
  const hasBindingGyp = entries.some(
    (entry) => entry.toLowerCase() === "package/binding.gyp",
  );
  return [
    ...(hooks.length > 0
      ? [`install-time lifecycle scripts: ${hooks.join(", ")}`]
      : []),
    ...(gypfile === true || hasBindingGyp
      ? ["gypfile/binding.gyp enables npm's implicit install"]
      : []),
  ];
}

/**
 * Aggregates findings to their highest severity, or PASS when there are none.
 *
 * @param findings Verification findings.
 * @returns The highest finding severity.
 */
export function aggregateSeverity(
  findings: readonly Pick<VerificationFinding, "severity" | "id">[],
): Severity {
  return findings.reduce<Severity>(
    (highest, finding) =>
      SEVERITY_RANK[finding.severity] > SEVERITY_RANK[highest]
        ? finding.severity
        : highest,
    "PASS",
  );
}

function filePatternToRegExp(pattern: string): RegExp {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? "";
    if (character === "*" && pattern[index + 1] === "*") {
      index += 1;
      if (pattern[index + 1] === "/") {
        index += 1;
        expression += "(?:.*/)?";
      } else {
        expression += ".*";
      }
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[.+^$()|\\]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`);
}

function isDirectoryAllowedByPattern(path: string, pattern: string): boolean {
  if (pattern.includes("*") || pattern.includes("?")) return false;
  const prefix = (pattern.split(/[*?]/, 1)[0] ?? "").replace(/\/+$/, "");
  return prefix !== "" && (path === prefix || path.startsWith(`${prefix}/`));
}

// biome-ignore lint/complexity/useMaxParams: Check outcomes stay explicit at call sites.
function addResult(
  checks: VerificationCheck[],
  findings: VerificationFinding[],
  id: string,
  title: string,
  status: VerificationCheck["status"],
  failureSeverity: Severity,
  detail: string,
): void {
  const checkId = status === "error" ? `${id}.error` : id;
  checks.push({ id: checkId, status, detail });
  if (status !== "pass") {
    findings.push({
      id: checkId,
      severity: status === "error" ? "HIGH" : failureSeverity,
      title: status === "error" ? `${title} could not be verified` : title,
      detail,
    });
  }
}

// biome-ignore lint/complexity/useMaxParams: Preserve separate git args, cwd, and output encoding.
function execGit(
  args: string[],
  cwd: string,
  encoding: BufferEncoding = "utf8",
): string {
  return execFileSync("git", args, {
    cwd,
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseManifest(source: string): RegistryManifest {
  return JSON.parse(source) as RegistryManifest;
}

function readPackageSourcesAtRef(ref: string, cwd: string): PackageSource[] {
  const directories = execGit(
    ["ls-tree", "-d", "--name-only", `${ref}:packages`],
    cwd,
  )
    .split("\n")
    .filter(Boolean);
  const sources: PackageSource[] = [];
  for (const directory of directories) {
    try {
      const manifest = parseManifest(
        execGit(["show", `${ref}:packages/${directory}/package.json`], cwd),
      );
      sources.push({ directory, manifest });
    } catch (error) {
      if (isMissingGitPath(error)) continue;
      throw error;
    }
  }
  return sources;
}

function isMissingGitPath(error: unknown): boolean {
  if (
    !(error instanceof Error) ||
    !("status" in error) ||
    error.status !== 128
  ) {
    return false;
  }
  const stderr = "stderr" in error ? String(error.stderr) : "";
  return /does not exist in|exists on disk, but not in|path .* does not exist/i.test(
    stderr,
  );
}

function isUnknownGitObject(error: unknown): boolean {
  if (
    !(error instanceof Error) ||
    !("status" in error) ||
    error.status !== 128
  ) {
    return false;
  }
  const stderr = "stderr" in error ? String(error.stderr) : "";
  return /not a valid (?:commit|object) name|bad object/i.test(stderr);
}

function isMissingGitTag(error: unknown): boolean {
  if (
    !(error instanceof Error) ||
    !("status" in error) ||
    error.status !== 128
  ) {
    return false;
  }
  const stderr = "stderr" in error ? String(error.stderr) : "";
  return /Needed a single revision|unknown revision or path/i.test(stderr);
}

function isMissingNextRef(error: unknown): boolean {
  const stderr =
    typeof error === "object" && error != null && "stderr" in error
      ? String(error.stderr)
      : "";
  return /couldn't find remote ref next|could not find remote ref next/i.test(
    `${getErrorMessage(error)}\n${stderr}`,
  );
}

function fetchReleaseRefs(cwd: string): void {
  try {
    execGit(["fetch", "origin", "main", "next", "--tags", "--force"], cwd);
  } catch (error) {
    if (!isMissingNextRef(error)) throw error;
    execGit(["fetch", "origin", "main", "--tags", "--force"], cwd);
  }
}

// biome-ignore lint/complexity/useMaxParams: Keep source and report state explicit.
function checkPackageKnown(
  name: string,
  sources: readonly PackageSource[],
  checks: VerificationCheck[],
  findings: VerificationFinding[],
): void {
  const known = sources.some(
    ({ manifest }) => manifest.name === name && manifest.private !== true,
  );
  addResult(
    checks,
    findings,
    "package.known",
    "Package is published from this repository",
    known ? "pass" : "fail",
    "HIGH",
    known
      ? `${name} is a non-private package in origin/main.`
      : `${name} is not a non-private package in origin/main.`,
  );
}

// biome-ignore lint/complexity/useMaxParams: Keep source and report state explicit.
function addGitCommitCheck(
  commit: string | null,
  cwd: string,
  checks: VerificationCheck[],
  findings: VerificationFinding[],
): void {
  if (commit == null || !/^[a-f0-9]{40,64}$/i.test(commit)) {
    addResult(
      checks,
      findings,
      "git.commit",
      "Provenance commit is reachable from a release branch",
      "fail",
      "CRITICAL",
      `Provenance gitCommit is missing or invalid: ${commit ?? "(missing)"}.`,
    );
    return;
  }
  for (const ref of ["origin/main", "origin/next"]) {
    try {
      execGit(["merge-base", "--is-ancestor", commit, ref], cwd);
      addResult(
        checks,
        findings,
        "git.commit",
        "Provenance commit is reachable from a release branch",
        "pass",
        "CRITICAL",
        `${commit} is an ancestor of ${ref}.`,
      );
      return;
    } catch (error) {
      if (
        getErrorStatus(error) === 1 ||
        isMissingGitPath(error) ||
        isUnknownGitObject(error)
      ) {
        continue;
      }
      addError(
        checks,
        findings,
        "git.commit",
        "Provenance commit reachability can be checked",
        error,
      );
      return;
    }
  }
  addResult(
    checks,
    findings,
    "git.commit",
    "Provenance commit is reachable from a release branch",
    "fail",
    "CRITICAL",
    `${commit} is not an ancestor of origin/main or origin/next.`,
  );
}

function getErrorStatus(error: unknown): number | undefined {
  return typeof error === "object" && error != null && "status" in error
    ? Number(error.status)
    : undefined;
}

// biome-ignore lint/complexity/useMaxParams: Keep release and report inputs explicit.
function addGitTagCheck(
  name: string,
  version: string,
  commit: string | null,
  cwd: string,
  checks: VerificationCheck[],
  findings: VerificationFinding[],
): void {
  const tag = `${name}-v${version}`;
  let taggedCommit: string;
  try {
    taggedCommit = execGit(
      ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`],
      cwd,
    ).trim();
  } catch (error) {
    if (!isMissingGitTag(error)) {
      addError(
        checks,
        findings,
        "git.tag",
        "Package tag points to the provenance commit",
        error,
      );
      return;
    }
    addResult(
      checks,
      findings,
      "git.tag",
      "Package tag points to the provenance commit",
      "fail",
      "HIGH",
      `Tag ${tag} is missing.`,
    );
    return;
  }
  const matches =
    commit != null && taggedCommit.toLowerCase() === commit.toLowerCase();
  addResult(
    checks,
    findings,
    "git.tag",
    "Package tag points to the provenance commit",
    matches ? "pass" : "fail",
    "HIGH",
    matches
      ? `Tag ${tag} points to ${taggedCommit}.`
      : `Tag ${tag} points to ${taggedCommit}, expected ${commit ?? "(missing provenance gitCommit)"}.`,
  );
}

// biome-ignore lint/complexity/useMaxParams: Keep check error context explicit.
function addError(
  checks: VerificationCheck[],
  findings: VerificationFinding[],
  id: string,
  title: string,
  error: unknown,
): void {
  addResult(
    checks,
    findings,
    id,
    title,
    "error",
    "HIGH",
    sanitizeLogLine(getErrorMessage(error)),
  );
}

async function fetchJson<T>(
  url: string,
  headers: HeadersInit = {},
): Promise<{ status: number; value?: T; body: string }> {
  const response = await fetch(url, { headers, redirect: "error" });
  const body = await response.text();
  if (!response.ok) return { status: response.status, body };
  return {
    status: response.status,
    body,
    value: JSON.parse(body) as T,
  };
}

function assertRegistryUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== EXPECTED.registry) {
    throw new Error(`Expected an HTTPS npm registry URL, got ${url.origin}.`);
  }
}

// biome-ignore lint/complexity/useMaxParams: Keep npm command and report inputs explicit.
async function checkNpmSignatures(
  name: string,
  version: string,
  checks: VerificationCheck[],
  findings: VerificationFinding[],
): Promise<void> {
  let directory: string;
  try {
    directory = mkdtempSync(join(tmpdir(), "npm-release-signatures-"));
  } catch (error) {
    addError(
      checks,
      findings,
      "provenance.signatures",
      "npm signatures verification command runs",
      error,
    );
    return;
  }
  try {
    execFileSync("npm", ["init", "-y"], {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    execFileSync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--registry",
        EXPECTED.registry,
        `${name}@${version}`,
      ],
      {
        cwd: directory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output: string;
    try {
      output = execFileSync("npm", ["audit", "signatures", "--json"], {
        cwd: directory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      addResult(
        checks,
        findings,
        "provenance.signatures",
        "npm signatures verify",
        "pass",
        "CRITICAL",
        output.trim() || "npm audit signatures completed successfully.",
      );
    } catch (error) {
      const stdout =
        typeof error === "object" && error != null && "stdout" in error
          ? String(error.stdout)
          : "";
      const stderr =
        typeof error === "object" && error != null && "stderr" in error
          ? String(error.stderr)
          : "";
      output = `${stdout}\n${stderr}`;
      if (
        output.includes(`${name}@${version}`) ||
        output.includes(`"${name}"`)
      ) {
        addResult(
          checks,
          findings,
          "provenance.signatures",
          "npm signatures verify",
          "fail",
          "CRITICAL",
          `npm reported a signature verification failure for ${name}@${version}: ${output.trim().slice(0, 1000)}`,
        );
      } else if (
        /signature|attestation|provenance|integrity|verified/i.test(output)
      ) {
        addResult(
          checks,
          findings,
          "provenance.signatures",
          "npm signatures verify",
          "fail",
          "HIGH",
          `npm reported a signature verification failure without identifying the target package: ${output.trim().slice(0, 1000)}`,
        );
      } else {
        addError(
          checks,
          findings,
          "provenance.signatures",
          "npm signatures verify",
          error,
        );
      }
    }
  } catch (error) {
    addError(
      checks,
      findings,
      "provenance.signatures",
      "npm signatures verification command runs",
      error,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

// biome-ignore lint/complexity/useMaxParams: Keep registry manifest and report inputs explicit.
async function checkTarball(
  manifest: RegistryManifest,
  checks: VerificationCheck[],
  findings: VerificationFinding[],
): Promise<{
  entries: string[] | null;
  irregularEntries: string[];
  error: string | null;
}> {
  const integrity = manifest.dist?.integrity;
  const tarball = manifest.dist?.tarball;
  if (integrity == null || tarball == null) {
    addError(
      checks,
      findings,
      "tarball.integrity",
      "Tarball sha512 matches registry integrity",
      new Error("Registry manifest is missing dist.integrity or dist.tarball."),
    );
    return {
      entries: null,
      irregularEntries: [],
      error: "Tarball metadata is unavailable.",
    };
  }
  let bytes: Buffer;
  try {
    assertRegistryUrl(tarball);
    const response = await fetch(tarball, { redirect: "error" });
    if (!response.ok) {
      throw new Error(
        `Tarball download failed (${response.status} ${response.statusText}).`,
      );
    }
    bytes = Buffer.from(await response.arrayBuffer());
    const expected = integrityToSha512Hex(integrity);
    const actual = createHash("sha512").update(bytes).digest("hex");
    const matches = expected != null && expected === actual;
    addResult(
      checks,
      findings,
      "tarball.integrity",
      "Tarball sha512 matches registry integrity",
      matches ? "pass" : "fail",
      "CRITICAL",
      matches
        ? `Downloaded tarball digest matches ${integrity}.`
        : `Expected ${expected ?? integrity}, downloaded tarball digest is ${actual}.`,
    );
  } catch (error) {
    addError(
      checks,
      findings,
      "tarball.integrity",
      "Tarball sha512 and contents can be inspected",
      error,
    );
    return {
      entries: null,
      irregularEntries: [],
      error: getErrorMessage(error),
    };
  }

  let tempDir: string;
  try {
    tempDir = mkdtempSync(join(tmpdir(), "npm-release-tarball-"));
  } catch (error) {
    return {
      entries: null,
      irregularEntries: [],
      error: getErrorMessage(error),
    };
  }
  try {
    const tarballPath = join(tempDir, "package.tgz");
    writeFileSync(tarballPath, bytes);
    const listing = execFileSync("tar", ["-tzf", tarballPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const details = execFileSync("tar", ["-tvzf", tarballPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const entries = listing.split("\n").filter(Boolean);
    const irregularEntries = details
      .split("\n")
      .filter((line) => line !== "" && !["-", "d"].includes(line[0] ?? ""))
      .map((line) => line.trim());
    return { entries, irregularEntries, error: null };
  } catch (error) {
    return {
      entries: null,
      irregularEntries: [],
      error: getErrorMessage(error),
    };
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

// biome-ignore lint/complexity/useMaxParams: Keep release and report inputs explicit.
async function checkGithubRelease(
  name: string,
  version: string,
  checks: VerificationCheck[],
  findings: VerificationFinding[],
): Promise<void> {
  const tag = `${name}-v${version}`;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const headers: HeadersInit =
    token == null ? {} : { Authorization: `Bearer ${token}` };
  try {
    const response = await fetchJson(
      `https://api.github.com/repos/${EXPECTED.githubRepository}/releases/tags/${encodeURIComponent(tag)}`,
      {
        ...headers,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    );
    if (response.status === 404) {
      addResult(
        checks,
        findings,
        "github.release",
        "GitHub release exists for package tag",
        "fail",
        "MEDIUM",
        `GitHub release ${tag} was not found.`,
      );
    } else if (response.status >= 200 && response.status < 300) {
      addResult(
        checks,
        findings,
        "github.release",
        "GitHub release exists for package tag",
        "pass",
        "MEDIUM",
        `GitHub release ${tag} exists.`,
      );
    } else {
      throw new Error(
        `GitHub release lookup failed with HTTP ${response.status}: ${response.body.slice(0, 500)}`,
      );
    }
  } catch (error) {
    addError(
      checks,
      findings,
      "github.release",
      "GitHub release lookup",
      error,
    );
  }
}

/**
 * Verifies registry metadata, provenance, source history, and package contents.
 *
 * @param options The package identity and optional working directory.
 * @returns A report, including findings for checks that could not complete.
 */
async function verifyNpmRelease(options: {
  name: string;
  version: string;
  cwd?: string;
}): Promise<NpmReleaseReport> {
  const { name, version } = options;
  const cwd = options.cwd ?? process.cwd();
  const checks: VerificationCheck[] = [];
  const findings: VerificationFinding[] = [];
  let previousVersion: string | null = null;
  let gitCommit: string | null = null;
  let packument: Packument = {};

  let refsFetched = true;
  try {
    fetchReleaseRefs(cwd);
  } catch (error) {
    refsFetched = false;
    addError(
      checks,
      findings,
      "package.known",
      "Package is published from this repository",
      error,
    );
    addError(
      checks,
      findings,
      "git.commit",
      "Release branch history can be fetched",
      error,
    );
  }
  let mainSources: PackageSource[] = [];
  if (refsFetched) {
    try {
      mainSources = readPackageSourcesAtRef("origin/main", cwd);
      checkPackageKnown(name, mainSources, checks, findings);
    } catch (error) {
      addError(
        checks,
        findings,
        "package.known",
        "Package is published from this repository",
        error,
      );
    }
  }

  try {
    const registryResponse = await fetchJson<Packument>(
      `${EXPECTED.registry}/${name.replaceAll("/", "%2f")}`,
    );
    if (registryResponse.status >= 200 && registryResponse.status < 300) {
      packument = registryResponse.value ?? {};
    } else if (registryResponse.status !== 404) {
      addError(
        checks,
        findings,
        "registry.version",
        "Requested version exists on npm",
        new Error(
          `npm registry request failed with HTTP ${registryResponse.status}: ${registryResponse.body.slice(0, 500)}`,
        ),
      );
    }
  } catch (error) {
    addError(
      checks,
      findings,
      "registry.version",
      "Requested version exists on npm",
      error,
    );
  }
  const manifest = packument.versions?.[version];
  if (manifest == null) {
    if (!checks.some(({ id }) => id === "registry.version.error")) {
      addResult(
        checks,
        findings,
        "registry.version",
        "Requested version exists on npm",
        "fail",
        "CRITICAL",
        `${name}@${version} is not present in the npm packument.`,
      );
    }
    for (const [id, title] of [
      ["tarball.integrity", "Tarball sha512 matches registry integrity"],
      ["provenance.present", "SLSA provenance is present"],
      ["provenance.subject", "Provenance subject matches package integrity"],
      [
        "provenance.source",
        "Provenance identifies the trusted source workflow",
      ],
      ["provenance.signatures", "npm signatures verify"],
      [
        "manifest.install-scripts",
        "Package has no install-time lifecycle hooks",
      ],
      ["manifest.bin", "Package exposes a command-line binary"],
      [
        "manifest.dependencies",
        "Published dependency declarations match source",
      ],
      ["manifest.files", "Tarball files match the source files allowlist"],
      [
        "manifest.identity",
        "Package identity is unchanged from previous version",
      ],
    ] as const) {
      addError(
        checks,
        findings,
        id,
        title,
        new Error("Requested registry manifest is unavailable."),
      );
    }
  } else {
    addResult(
      checks,
      findings,
      "registry.version",
      "Requested version exists on npm",
      "pass",
      "CRITICAL",
      `${name}@${version} exists on npm.`,
    );
    previousVersion = selectPreviousVersion(packument, version);

    const tarballResult = await checkTarball(manifest, checks, findings);
    const archiveEntries = tarballResult.entries;
    if (archiveEntries == null) {
      addError(
        checks,
        findings,
        "manifest.install-scripts",
        "Package has no install-time lifecycle hooks",
        new Error(
          `Tarball entries are unavailable to check for binding.gyp: ${tarballResult.error ?? "unknown error"}`,
        ),
      );
      addError(
        checks,
        findings,
        "manifest.files",
        "Tarball files match the source files allowlist",
        new Error(
          `Tarball entries are unavailable: ${tarballResult.error ?? "unknown error"}`,
        ),
      );
    } else {
      const installProblems = findInstallProblems(
        manifest.scripts,
        manifest.gypfile,
        archiveEntries,
      );
      addResult(
        checks,
        findings,
        "manifest.install-scripts",
        "Package has no install-time lifecycle hooks",
        installProblems.length === 0 ? "pass" : "fail",
        "CRITICAL",
        installProblems.length === 0
          ? "No install-time scripts or native addon build files are present."
          : installProblems.join("; "),
      );
    }

    const manifestBinEvaluation = evaluateManifestBin(manifest.bin);
    checks.push(...manifestBinEvaluation.checks);
    findings.push(...manifestBinEvaluation.findings);

    if (previousVersion == null) {
      addResult(
        checks,
        findings,
        "manifest.identity",
        "Package identity is unchanged from previous version",
        "pass",
        "MEDIUM",
        "No previous version exists on the same release channel; identity comparison was skipped.",
      );
    } else {
      const previousManifest = packument.versions?.[previousVersion];
      if (previousManifest == null) {
        addError(
          checks,
          findings,
          "manifest.identity",
          "Package identity is unchanged from previous version",
          new Error(`Previous manifest ${previousVersion} is missing.`),
        );
      } else {
        const identityMismatches = compareManifestIdentity(
          manifest,
          previousManifest,
        );
        addResult(
          checks,
          findings,
          "manifest.identity",
          "Package identity is unchanged from previous version",
          identityMismatches.length === 0 ? "pass" : "fail",
          "MEDIUM",
          identityMismatches.length === 0
            ? `repository.url, license, and name match ${previousVersion}.`
            : identityMismatches.join("; "),
        );
      }
    }

    const attestationsUrl = manifest.dist?.attestations?.url;
    if (attestationsUrl == null || attestationsUrl === "") {
      const evaluation = evaluateProvenance(
        undefined,
        [],
        manifest.dist?.integrity ?? "",
      );
      checks.push(...evaluation.checks);
      findings.push(...evaluation.findings);
    } else {
      try {
        assertRegistryUrl(attestationsUrl);
        const attestationsResponse = await fetchJson<{
          attestations?: Attestation[];
        }>(attestationsUrl);
        if (
          attestationsResponse.status < 200 ||
          attestationsResponse.status >= 300 ||
          attestationsResponse.value == null
        ) {
          throw new Error(
            `Attestations request failed with HTTP ${attestationsResponse.status}: ${attestationsResponse.body.slice(0, 500)}`,
          );
        }
        const evaluation = evaluateProvenance(
          attestationsUrl,
          attestationsResponse.value.attestations ?? [],
          manifest.dist?.integrity ?? "",
        );
        checks.push(...evaluation.checks);
        findings.push(...evaluation.findings);
        gitCommit = evaluation.gitCommit;
      } catch (error) {
        addError(
          checks,
          findings,
          "provenance.present",
          "SLSA provenance lookup",
          error,
        );
        addError(
          checks,
          findings,
          "provenance.subject",
          "Provenance subject matches package integrity",
          error,
        );
        addError(
          checks,
          findings,
          "provenance.source",
          "Provenance identifies the trusted source workflow",
          error,
        );
      }
    }

    await checkNpmSignatures(name, version, checks, findings);

    let source: PackageSource | undefined;
    if (gitCommit != null && /^[a-f0-9]{40,64}$/i.test(gitCommit)) {
      try {
        source = readPackageSourcesAtRef(gitCommit, cwd).find(
          ({ manifest: sourceManifest }) => sourceManifest.name === name,
        );
      } catch (error) {
        addError(
          checks,
          findings,
          "manifest.dependencies",
          "Published dependency declarations match source",
          error,
        );
        addError(
          checks,
          findings,
          "manifest.files",
          "Tarball files match the source files allowlist",
          error,
        );
      }
    }
    if (source == null) {
      if (!checks.some(({ id }) => id === "manifest.dependencies.error")) {
        addError(
          checks,
          findings,
          "manifest.dependencies",
          "Published dependency declarations match source",
          new Error("Could not find this package at the provenance commit."),
        );
      }
      if (!checks.some(({ id }) => id === "manifest.files.error")) {
        addError(
          checks,
          findings,
          "manifest.files",
          "Tarball files match the source files allowlist",
          new Error("Could not find this package at the provenance commit."),
        );
      }
    } else {
      const dependencyMismatches = compareManifestDependencies(
        manifest,
        source.manifest,
      );
      addResult(
        checks,
        findings,
        "manifest.dependencies",
        "Published dependency declarations match source",
        dependencyMismatches.length === 0 ? "pass" : "fail",
        "HIGH",
        dependencyMismatches.length === 0
          ? "Dependency names and non-workspace specifiers match the provenance commit."
          : dependencyMismatches.join("; "),
      );
      if (archiveEntries != null) {
        const filesResult = checkTarballFiles(
          archiveEntries,
          source.manifest.files,
          tarballResult.irregularEntries,
        );
        if (filesResult.error != null) {
          addError(
            checks,
            findings,
            "manifest.files",
            "Tarball files match the source files allowlist",
            new Error(filesResult.error),
          );
        } else if (filesResult.unexpected.length > 0) {
          addResult(
            checks,
            findings,
            "manifest.files",
            "Tarball files match the source files allowlist",
            "fail",
            "HIGH",
            [
              ...(filesResult.unexpected.length > 0
                ? [`Unexpected entries: ${filesResult.unexpected.join(", ")}`]
                : []),
            ].join("; "),
          );
        } else {
          addResult(
            checks,
            findings,
            "manifest.files",
            "Tarball files match the source files allowlist",
            "pass",
            "HIGH",
            "Every tarball entry is allowed by the source manifest.",
          );
        }
      }
    }
  }

  if (manifest == null) {
    if (!checks.some(({ id }) => id === "git.commit.error")) {
      addError(
        checks,
        findings,
        "git.commit",
        "Provenance commit is reachable from a release branch",
        new Error(
          "The registry version is unavailable; no provenance commit can be inspected.",
        ),
      );
    }
    addError(
      checks,
      findings,
      "git.tag",
      "Package tag points to the provenance commit",
      new Error("Registry version is unavailable."),
    );
    await checkGithubRelease(name, version, checks, findings);
  } else {
    if (refsFetched) {
      addGitCommitCheck(gitCommit, cwd, checks, findings);
      addGitTagCheck(name, version, gitCommit, cwd, checks, findings);
    } else {
      addError(
        checks,
        findings,
        "git.tag",
        "Package tag points to the provenance commit",
        new Error("Git refs could not be fetched to inspect the package tag."),
      );
    }
    await checkGithubRelease(name, version, checks, findings);
  }

  return {
    package: name,
    version,
    previousVersion,
    gitCommit,
    severity: aggregateSeverity(findings),
    checks,
    findings,
  };
}

function parseReleaseSpec(spec: string): { name: string; version: string } {
  const separator = spec.lastIndexOf("@");
  if (separator <= 0 || separator === spec.length - 1) {
    throw new Error("Expected a release spec in <name>@<version> form.");
  }
  return { name: spec.slice(0, separator), version: spec.slice(separator + 1) };
}

function renderHumanReport(report: NpmReleaseReport): string {
  const lines = [
    `${report.package}@${report.version}: ${report.severity}`,
    `Previous version: ${report.previousVersion ?? "none"}`,
    `Provenance commit: ${report.gitCommit ?? "none"}`,
    ...report.checks.map(
      ({ id, status, detail }) => `[${status.toUpperCase()}] ${id}: ${detail}`,
    ),
  ];
  if (report.findings.length > 0) {
    lines.push(
      "",
      "Findings:",
      ...report.findings.map(
        ({ severity, id, title, detail }) =>
          `- ${severity} ${id}: ${title} — ${detail}`,
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Parses the CLI arguments, runs verification, and prints its report.
 *
 * @param args Command-line arguments.
 * @param options Optional output writer and working directory.
 * @returns The verification report.
 */
async function main(
  args: string[] = process.argv.slice(2),
  options: {
    cwd?: string;
    writeOutput?: (output: string) => void;
  } = {},
): Promise<NpmReleaseReport> {
  let json = false;
  let spec: string | undefined;
  for (const argument of args) {
    if (argument === "--json") {
      json = true;
    } else if (argument.startsWith("-") || spec != null) {
      throw new Error(
        "Usage: node scripts/release/verify-npm-release.ts <name>@<version> [--json]",
      );
    } else {
      spec = argument;
    }
  }
  if (spec == null) {
    throw new Error(
      "Usage: node scripts/release/verify-npm-release.ts <name>@<version> [--json]",
    );
  }
  const { name, version } = parseReleaseSpec(spec);
  let report: NpmReleaseReport;
  try {
    report = await verifyNpmRelease({ name, version, cwd: options.cwd });
  } catch (error) {
    const detail = sanitizeLogLine(getErrorMessage(error));
    report = {
      package: name,
      version,
      previousVersion: null,
      gitCommit: null,
      severity: "HIGH",
      checks: [{ id: "verification.error", status: "error", detail }],
      findings: [
        {
          id: "verification.error",
          severity: "HIGH",
          title: "Release verification could not complete",
          detail,
        },
      ],
    };
  }
  const writeOutput =
    options.writeOutput ?? ((output: string) => process.stdout.write(output));
  writeOutput(
    json ? `${JSON.stringify(report, null, 2)}\n` : renderHumanReport(report),
  );
  return report;
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    process.stderr.write(`${sanitizeLogLine(getErrorMessage(error))}\n`);
    process.exitCode = 2;
  });
}
