#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  getErrorMessage,
  parseReleaseSpec,
  sanitizeLogLine,
} from "../publish/helpers.ts";
import { releaseTag } from "../publish/pack.ts";
import { loadBundledPacote } from "../publish/read-tarball-identity.ts";
import {
  listTarballEntries,
  loadBundledTar,
  type TarEntry,
} from "../publish/verify-tarball-collisions.ts";

// These verification values intentionally remain constants, not runtime options.
const EXPECTED = {
  repository: "https://github.com/morpho-org/sdks",
  repositoryId: "829304716",
  builder: "https://github.com/actions/runner/github-hosted",
  event: "push",
  githubRepository: "morpho-org/sdks",
  registry: "https://registry.npmjs.org",
} as const;

interface Publisher {
  /** Workflow the run started from (`workflow.path` of the provenance). */
  readonly workflowPath: string;
  /** Workflow file that holds the publishing job (the Sigstore signer). */
  readonly signerWorkflowPath: string;
  readonly refs: readonly string[];
}

/** Pipelines allowed to publish, matched on the provenance `workflow.path`. */
const PUBLISHERS: readonly Publisher[] = [
  {
    workflowPath: ".github/workflows/release.yml",
    signerWorkflowPath: ".github/workflows/release.yml",
    refs: ["refs/heads/main"],
  },
  // Versions published before the repository became release-only (SDK-1322).
  {
    workflowPath: ".github/workflows/push.yml",
    signerWorkflowPath: ".github/workflows/publish.yml",
    refs: ["refs/heads/main", "refs/heads/next"],
  },
];

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
  bundle?: {
    dsseEnvelope?: {
      payload?: string;
      payloadType?: string;
      signatures?: { sig?: string }[];
    };
    verificationMaterial?: {
      certificate?: { rawBytes?: string };
      x509CertificateChain?: { certificates?: { rawBytes?: string }[] };
    };
  };
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

interface SignatureEvaluation {
  status: VerificationCheck["status"];
  severity: Severity;
  detail: string;
  signerRef: string | null;
}

interface SigstoreVerifyOptions {
  certificateIssuer: string;
  certificateIdentityURI: string;
  certificateOIDs: Record<string, string>;
}

interface SigstoreSigner {
  identity?: { subjectAlternativeName?: string };
}

type BundleVerifier = (
  bundle: NonNullable<Attestation["bundle"]>,
  options: SigstoreVerifyOptions,
) => Promise<SigstoreSigner>;

interface CheckEvaluation {
  status: VerificationCheck["status"];
  severity: Severity;
  detail: string;
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
 * Evaluates downloaded tarball bytes against registry integrity and origin.
 *
 * @param bytes Downloaded tarball bytes.
 * @param integrity The registry's sha512 integrity value.
 * @param tarballUrl The registry-provided tarball URL.
 * @returns The deterministic integrity-check verdict.
 */
// biome-ignore lint/complexity/useMaxParams: Preserve the required pure evaluator signature.
export function evaluateTarballIntegrity(
  bytes: Uint8Array,
  integrity: string,
  tarballUrl: string,
): CheckEvaluation {
  try {
    assertRegistryUrl(tarballUrl);
  } catch (error) {
    return {
      status: "error",
      severity: "HIGH",
      detail: getErrorMessage(error),
    };
  }
  const expected = integrityToSha512Hex(integrity);
  const actual = createHash("sha512").update(bytes).digest("hex");
  const matches = expected != null && expected === actual;
  return {
    status: matches ? "pass" : "fail",
    severity: "CRITICAL",
    detail: matches
      ? `Downloaded tarball digest matches ${integrity}.`
      : `Expected ${expected ?? integrity}, downloaded tarball digest is ${actual}.`,
  };
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
  const eligible: { version: string; time: number }[] = [];
  for (const [candidate, publishTime] of Object.entries(packument.time ?? {})) {
    if (
      candidate === "created" ||
      candidate === "modified" ||
      candidate === version ||
      packument.versions?.[candidate] == null
    ) {
      continue;
    }
    const time = Date.parse(publishTime);
    if (Number.isFinite(time) && time < targetTime) {
      eligible.push({ version: candidate, time });
    }
  }
  const mostRecent = (
    candidates: readonly { version: string; time: number }[],
  ): string | null =>
    candidates.reduce<{ version: string; time: number } | undefined>(
      (previous, candidate) =>
        previous == null || candidate.time > previous.time
          ? candidate
          : previous,
      undefined,
    )?.version ?? null;

  if (!version.includes("-")) {
    return mostRecent(
      eligible.filter(({ version: candidate }) => !candidate.includes("-")),
    );
  }

  const preid = /^\d+\.\d+\.\d+-([0-9A-Za-z]+)/.exec(version)?.[1];
  const samePreid = eligible.filter(({ version: candidate }) => {
    if (!candidate.includes("-")) return false;
    return /^\d+\.\d+\.\d+-([0-9A-Za-z]+)/.exec(candidate)?.[1] === preid;
  });
  return (
    mostRecent(samePreid) ??
    mostRecent(
      eligible.filter(({ version: candidate }) => !candidate.includes("-")),
    )
  );
}

/**
 * Evaluates provenance attestations against the expected GitHub Actions source.
 *
 * @param attestationsUrl The release manifest's attestations URL, if present.
 * @param attestations Entries returned by the npm attestations endpoint.
 * @param integrity The published package's sha512 integrity.
 * @param options Optional Sigstore verifier injection for deterministic tests.
 * @returns Provenance checks, findings, and the source commit digest.
 */
// biome-ignore lint/complexity/useMaxParams: Keep this pure evaluator's inputs explicit.
export async function evaluateProvenance(
  attestationsUrl: string | undefined,
  attestations: readonly Attestation[],
  integrity: string,
  options: { verifyBundle?: BundleVerifier } = {},
): Promise<ProvenanceEvaluation> {
  const checks: VerificationCheck[] = [];
  const findings: VerificationFinding[] = [];
  const failNoStatement = (details: {
    presentStatus: VerificationCheck["status"];
    presentSeverity: Severity;
    presentDetail: string;
    signatureStatus: VerificationCheck["status"];
    signatureSeverity: Severity;
    signatureDetail: string;
    unavailableDetail: string;
  }): ProvenanceEvaluation => {
    addResult(
      checks,
      findings,
      "provenance.present",
      "SLSA provenance is present",
      details.presentStatus,
      details.presentSeverity,
      details.presentDetail,
    );
    addResult(
      checks,
      findings,
      "provenance.signature",
      "SLSA statement is signed by the expected workflow identity",
      details.signatureStatus,
      details.signatureSeverity,
      details.signatureDetail,
    );
    addResult(
      checks,
      findings,
      "provenance.subject",
      "Provenance subject matches package integrity",
      "error",
      "HIGH",
      details.unavailableDetail,
    );
    addResult(
      checks,
      findings,
      "provenance.source",
      "Provenance identifies the trusted source workflow",
      "error",
      "HIGH",
      details.unavailableDetail,
    );
    return { checks, findings, gitCommit: null };
  };

  if (attestationsUrl == null || attestationsUrl === "") {
    return failNoStatement({
      presentStatus: "fail",
      presentSeverity: "CRITICAL",
      presentDetail: "The published manifest has no attestations URL.",
      signatureStatus: "fail",
      signatureSeverity: "CRITICAL",
      signatureDetail: "No SLSA DSSE bundle is available to verify.",
      unavailableDetail: "No SLSA statement is available to inspect.",
    });
  }

  const attestation = attestations.find(
    ({ predicateType, bundle }) =>
      predicateType === SLSA_PREDICATE_TYPE &&
      bundle?.dsseEnvelope?.payload != null,
  );
  const payload = attestation?.bundle?.dsseEnvelope?.payload;
  if (attestation == null || payload == null) {
    return failNoStatement({
      presentStatus: "fail",
      presentSeverity: "CRITICAL",
      presentDetail: "The attestations response contains no SLSA v1 statement.",
      signatureStatus: "fail",
      signatureSeverity: "CRITICAL",
      signatureDetail: "No SLSA DSSE payload is available to verify.",
      unavailableDetail: "No SLSA statement is available to inspect.",
    });
  }

  let statement: ProvenanceStatement;
  try {
    statement = JSON.parse(
      Buffer.from(payload, "base64").toString("utf8"),
    ) as ProvenanceStatement;
  } catch (error) {
    const detail = `Could not decode the SLSA statement: ${getErrorMessage(error)}`;
    return failNoStatement({
      presentStatus: "error",
      presentSeverity: "HIGH",
      presentDetail: detail,
      signatureStatus: "error",
      signatureSeverity: "HIGH",
      signatureDetail: `Could not bind the signature to the SLSA statement: ${getErrorMessage(error)}`,
      unavailableDetail: "The SLSA statement could not be decoded.",
    });
  }

  const provenance = statement.predicate ?? statement;
  const workflow = provenance.buildDefinition?.externalParameters?.workflow;
  const github = provenance.buildDefinition?.internalParameters?.github;
  const gitCommit =
    provenance.buildDefinition?.resolvedDependencies?.[0]?.digest?.gitCommit ??
    null;
  const publisher = PUBLISHERS.find(
    ({ workflowPath }) => workflowPath === workflow?.path,
  );
  let signature = await evaluateSlsaSignature(
    attestation,
    publisher,
    workflow?.ref,
    gitCommit,
    options.verifyBundle,
  );
  const signatureVerified = signature.status === "pass";
  if (signatureVerified && signature.signerRef !== workflow?.ref) {
    signature = {
      ...signature,
      status: "fail",
      severity: "CRITICAL",
      detail: `Signer workflow ref expected ${workflow?.ref ?? "(missing)"}, got ${signature.signerRef ?? "(missing)"}.`,
    };
  }

  addResult(
    checks,
    findings,
    "provenance.signature",
    "SLSA statement is signed by the expected workflow identity",
    signature.status,
    signature.severity,
    signature.detail,
  );
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

  if (!signatureVerified) {
    addResult(
      checks,
      findings,
      "provenance.source",
      "Provenance identifies the trusted source workflow",
      "error",
      "HIGH",
      "The source metadata cannot be trusted because the SLSA signature check did not pass.",
    );
    return { checks, findings, gitCommit: null };
  }

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
  if (publisher === undefined) {
    mismatches.push(
      `workflow path expected ${PUBLISHERS.map(({ workflowPath }) => workflowPath).join(" or ")}, got ${workflow?.path ?? "(missing)"}`,
    );
  } else if (!publisher.refs.some((ref) => ref === workflow?.ref)) {
    mismatches.push(
      `ref expected ${publisher.refs.join(" or ")} for ${publisher.workflowPath}, got ${workflow?.ref ?? "(missing)"}`,
    );
  }
  if (workflow?.ref !== signature.signerRef) {
    mismatches.push(
      `signer ref ${signature.signerRef ?? "(missing)"} != predicate ref ${workflow?.ref ?? "(missing)"}`,
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
  return {
    checks,
    findings,
    gitCommit: signature.status === "pass" ? gitCommit : null,
  };
}

// biome-ignore lint/complexity/useMaxParams: Keep verifier inputs explicit.
async function evaluateSlsaSignature(
  attestation: Attestation,
  publisher: Publisher | undefined,
  workflowRef: string | undefined,
  gitCommit: string | null,
  verifyBundle?: BundleVerifier,
): Promise<SignatureEvaluation> {
  const bundle = attestation.bundle;
  const envelope = bundle?.dsseEnvelope;
  if (bundle == null || envelope?.payload == null) {
    return {
      status: "fail",
      severity: "CRITICAL",
      detail: "The SLSA DSSE bundle is incomplete.",
      signerRef: null,
    };
  }
  if (publisher === undefined) {
    return {
      status: "fail",
      severity: "CRITICAL",
      detail: "Predicate workflow path is not a trusted publish workflow.",
      signerRef: null,
    };
  }
  if (
    workflowRef == null ||
    !publisher.refs.some((ref) => ref === workflowRef)
  ) {
    return {
      status: "fail",
      severity: "CRITICAL",
      detail: `Predicate workflow ref is missing or not allowed: ${workflowRef ?? "(missing)"}.`,
      signerRef: null,
    };
  }
  if (gitCommit == null) {
    return {
      status: "fail",
      severity: "CRITICAL",
      detail: "The SLSA statement has no resolved git commit to bind.",
      signerRef: null,
    };
  }

  try {
    const verifyOptions: SigstoreVerifyOptions = {
      certificateIssuer: "https://token.actions.githubusercontent.com",
      certificateIdentityURI: `^${`${EXPECTED.repository}/${publisher.signerWorkflowPath}@${workflowRef}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      certificateOIDs: {
        "1.3.6.1.4.1.57264.1.11": encodeFulcioOidValue("github-hosted"),
        "1.3.6.1.4.1.57264.1.12": encodeFulcioOidValue(EXPECTED.repository),
        "1.3.6.1.4.1.57264.1.13": encodeFulcioOidValue(gitCommit),
        "1.3.6.1.4.1.57264.1.14": encodeFulcioOidValue(workflowRef),
        "1.3.6.1.4.1.57264.1.15": encodeFulcioOidValue(EXPECTED.repositoryId),
        "1.3.6.1.4.1.57264.1.18": encodeFulcioOidValue(
          `${EXPECTED.repository}/${publisher.workflowPath}@${workflowRef}`,
        ),
        "1.3.6.1.4.1.57264.1.20": encodeFulcioOidValue(EXPECTED.event),
      },
    };
    let signer: SigstoreSigner;
    if (verifyBundle == null) {
      const npmRoot = execFileSync("npm", ["root", "-g"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      const sigstore = createRequire(join(npmRoot, "npm", "package.json"))(
        "sigstore",
      ) as { verify: BundleVerifier };
      // Sigstore performs the Fulcio chain and transparency-log checks used by npm audit signatures.
      signer = await sigstore.verify(bundle, verifyOptions);
    } else {
      signer = await verifyBundle(bundle, verifyOptions);
    }
    const signerIdentity = signer.identity?.subjectAlternativeName;
    const signerRef = publisher.refs.find(
      (ref) =>
        signerIdentity ===
        `${EXPECTED.repository}/${publisher.signerWorkflowPath}@${ref}`,
    );
    if (signerRef == null) {
      return {
        status: "fail",
        severity: "CRITICAL",
        detail: `Sigstore signer identity is not an allowed publish workflow: ${signerIdentity ?? "(missing)"}.`,
        signerRef: null,
      };
    }
    return {
      status: "pass",
      severity: "CRITICAL",
      detail: `Sigstore verified the SLSA bundle for ${signerIdentity}.`,
      signerRef,
    };
  } catch (error) {
    const errorName =
      typeof error === "object" &&
      error != null &&
      "name" in error &&
      typeof error.name === "string"
        ? error.name
        : "";
    const verificationFailure = [
      "PolicyError",
      "ValidationError",
      "VerificationError",
    ].includes(errorName);
    return {
      status: verificationFailure ? "fail" : "error",
      severity: verificationFailure ? "CRITICAL" : "HIGH",
      detail: `${verificationFailure ? "Sigstore verification failed" : "Could not run Sigstore verification"}: ${getErrorMessage(error)}`,
      signerRef: null,
    };
  }
}

function encodeFulcioOidValue(value: string): string {
  return `\u000c${String.fromCharCode(Buffer.byteLength(value))}${value}`;
}

/**
 * Compares published dependency declarations with their source manifest.
 *
 * @param published The npm registry manifest.
 * @param source The package manifest at the attested commit.
 * @param catalog The top-level catalog at the attested commit.
 * @returns Human-readable dependency declaration mismatches.
 */
// biome-ignore lint/complexity/useMaxParams: Keep published/source/catalog inputs explicit.
export function compareManifestDependencies(
  published: RegistryManifest,
  source: RegistryManifest,
  catalog: Readonly<Record<string, string>> = {},
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
      if (expectedSpecifier == null) continue;
      if (expectedSpecifier.startsWith("workspace:")) {
        const workspaceRange = expectedSpecifier.slice("workspace:".length);
        const normalizedRange =
          workspaceRange === "^"
            ? /^\^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
            : workspaceRange === "~"
              ? /^~\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
              : workspaceRange === "*"
                ? /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
                : null;
        const validPublishedRange =
          actualSpecifier != null && /^[\w.\-^~<>=|* ]+$/.test(actualSpecifier);
        const expectedRange =
          workspaceRange === "^" ||
          workspaceRange === "~" ||
          workspaceRange === "*"
            ? normalizedRange?.test(actualSpecifier ?? "") === true
            : validPublishedRange && actualSpecifier === workspaceRange;
        if (!expectedRange) {
          mismatches.push(
            `${field}.${name} expected ${workspaceRange || "(empty workspace range)"}, got ${actualSpecifier ?? "(missing)"}`,
          );
        }
      } else if (expectedSpecifier.startsWith("catalog:")) {
        const catalogName = expectedSpecifier.slice("catalog:".length);
        if (catalogName !== "" && catalogName !== "default") {
          mismatches.push(
            `${field}.${name} uses unsupported catalog ${catalogName}`,
          );
        } else if (
          actualSpecifier == null ||
          !/^[\w.\-^~<>=|* ]+$/.test(actualSpecifier) ||
          catalog[name] == null ||
          actualSpecifier !== catalog[name]
        ) {
          mismatches.push(
            `${field}.${name} expected catalog range ${catalog[name] ?? "(missing)"}, got ${actualSpecifier ?? "(missing)"}`,
          );
        }
      } else if (
        actualSpecifier != null &&
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
 * Reports an error when the target release has no valid npm publish timestamp.
 *
 * @param publishTime The target version's packument time value.
 * @returns Timestamp validity, checks, and any finding.
 */
export function evaluatePublishTime(publishTime: string | undefined): {
  valid: boolean;
  checks: VerificationCheck[];
  findings: VerificationFinding[];
} {
  const checks: VerificationCheck[] = [];
  const findings: VerificationFinding[] = [];
  const valid = Number.isFinite(Date.parse(publishTime ?? ""));
  if (!valid) {
    addError(
      checks,
      findings,
      "manifest.identity",
      "Package identity is unchanged from previous version",
      new Error(
        "The npm packument has no valid publish time for this version.",
      ),
    );
  }
  return { valid, checks, findings };
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

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isRegistryManifest(value: unknown): value is RegistryManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const manifest = value as Record<string, unknown>;
  const repository = manifest.repository;
  return (
    (manifest.name === undefined || typeof manifest.name === "string") &&
    (manifest.version === undefined || typeof manifest.version === "string") &&
    (manifest.private === undefined || typeof manifest.private === "boolean") &&
    (manifest.scripts === undefined || isStringRecord(manifest.scripts)) &&
    (manifest.bin === undefined ||
      typeof manifest.bin === "string" ||
      isStringRecord(manifest.bin)) &&
    (manifest.gypfile === undefined || typeof manifest.gypfile === "boolean") &&
    (manifest.dependencies === undefined ||
      isStringRecord(manifest.dependencies)) &&
    (manifest.peerDependencies === undefined ||
      isStringRecord(manifest.peerDependencies)) &&
    (manifest.optionalDependencies === undefined ||
      isStringRecord(manifest.optionalDependencies)) &&
    (repository === undefined ||
      typeof repository === "string" ||
      (typeof repository === "object" &&
        repository !== null &&
        "url" in repository &&
        (repository.url === undefined ||
          typeof repository.url === "string"))) &&
    (manifest.license === undefined || typeof manifest.license === "string")
  );
}

/**
 * Creates a CRITICAL layout check for entries outside the package/ archive root.
 *
 * @param entries The paths returned by npm's bundled node-tar.
 * @returns The layout check and any finding.
 */
export function evaluateTarballLayout(
  entries: readonly Pick<TarEntry, "path">[],
): { checks: VerificationCheck[]; findings: VerificationFinding[] } {
  const checks: VerificationCheck[] = [];
  const findings: VerificationFinding[] = [];
  const outside = entries.filter(
    ({ path }) => path.replaceAll("\\", "/").split("/")[0] !== "package",
  );
  addResult(
    checks,
    findings,
    "tarball.layout",
    "Tarball entries are rooted at package/",
    outside.length === 0 ? "pass" : "fail",
    "CRITICAL",
    outside.length === 0
      ? "Every tarball entry has package/ as its root."
      : `Entries outside package/: ${outside.map(({ path }) => path).join(", ")}.`,
  );
  return { checks, findings };
}

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(",")}}`;
}

/**
 * Reports registry fields that differ from the consumer-visible tarball manifest.
 *
 * @param registry The packument manifest.
 * @param tarball The manifest read from the published archive through pacote.
 * @returns Names of fields whose values differ.
 */
export function compareRegistryManifest(
  registry: RegistryManifest,
  tarball: RegistryManifest,
): string[] {
  const mismatches: string[] = [];
  for (const field of [
    "name",
    "version",
    "scripts",
    "bin",
    "gypfile",
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const) {
    if (stableJson(registry[field]) !== stableJson(tarball[field])) {
      mismatches.push(
        `${field} differs between registry and tarball manifests`,
      );
    }
  }
  return mismatches;
}

/**
 * Evaluates whether the package manifest exposed by npm matches the tarball.
 *
 * @param registry The packument manifest.
 * @param tarball The manifest read from the published archive through pacote.
 * @returns The registry-drift check and any CRITICAL finding.
 */
export function evaluateRegistryManifest(
  registry: RegistryManifest,
  tarball: RegistryManifest,
): { checks: VerificationCheck[]; findings: VerificationFinding[] } {
  const mismatches = compareRegistryManifest(registry, tarball);
  const checks: VerificationCheck[] = [];
  const findings: VerificationFinding[] = [];
  addResult(
    checks,
    findings,
    "manifest.registry-drift",
    "Registry and tarball manifests agree",
    mismatches.length === 0 ? "pass" : "fail",
    "CRITICAL",
    mismatches.length === 0
      ? "The registry and consumer-visible tarball manifest fields match."
      : mismatches.join("; "),
  );
  return { checks, findings };
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
 * Creates the report check for npm's trusted-publisher metadata.
 *
 * @param trustedPublisher The published manifest's trusted publisher, if present.
 * @returns The check and any finding for trusted-publisher metadata.
 */
export function evaluateTrustedPublisher(
  trustedPublisher: { id?: string } | null | undefined,
): { checks: VerificationCheck[]; findings: VerificationFinding[] } {
  const checks: VerificationCheck[] = [];
  const findings: VerificationFinding[] = [];
  const present = trustedPublisher != null;
  addResult(
    checks,
    findings,
    "registry.trusted-publisher",
    "Package declares npm trusted publishing",
    present ? "pass" : "fail",
    "CRITICAL",
    present
      ? `The published manifest declares a trusted publisher (id: ${trustedPublisher.id ?? "(missing)"}).`
      : "The published manifest has no npm trusted publisher.",
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
 * @param entries Tarball paths, before or after stripping `package/`.
 * @returns Install-time execution risks.
 */
// biome-ignore lint/complexity/useMaxParams: Keep this pure checker's inputs explicit.
export function findInstallProblems(
  scripts: RegistryManifest["scripts"],
  gypfile: boolean | undefined,
  entries: readonly string[],
): string[] {
  const hooks = findInstallScripts(scripts);
  const hasBindingGyp = entries.some((entry) => {
    const normalized = entry.replaceAll("\\", "/").replace(/\/+$/, "");
    const segments = normalized.split("/");
    const relative =
      segments[0] === "package" ? segments.slice(1).join("/") : normalized;
    return relative.toLowerCase() === "binding.gyp";
  });
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

function readWorkspaceCatalogAtCommit(
  commit: string,
  cwd: string,
): Record<string, string> {
  const source = execGit(["show", `${commit}:pnpm-workspace.yaml`], cwd);
  const catalog: Record<string, string> = {};
  let inCatalog = false;
  for (const line of source.split("\n")) {
    if (!inCatalog) {
      inCatalog = line === "catalog:";
      continue;
    }
    const entry = /^ {2}([^:\s][^:]*):\s*(.*?)\s*$/.exec(line);
    if (entry?.[1] != null && entry[2] != null) {
      catalog[entry[1]] = entry[2].replace(/^(['"])(.*)\1$/, "$2");
    } else if (line !== "" && !/^\s/.test(line)) {
      break;
    }
  }
  return catalog;
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
      const manifest = JSON.parse(
        execGit(["show", `${ref}:packages/${directory}/package.json`], cwd),
      ) as RegistryManifest;
      sources.push({ directory, manifest });
    } catch (error) {
      if (
        isGitCommandError(
          error,
          /does not exist in|exists on disk, but not in|path .* does not exist/i,
        )
      ) {
        continue;
      }
      throw error;
    }
  }
  return sources;
}

function isGitCommandError(error: unknown, stderrPattern: RegExp): boolean {
  if (
    !(error instanceof Error) ||
    !("status" in error) ||
    error.status !== 128
  ) {
    return false;
  }
  const stderr = "stderr" in error ? String(error.stderr) : "";
  return stderrPattern.test(`${stderr}\n${getErrorMessage(error)}`);
}

/**
 * Remote-tracking namespace for the public repository's branches. The verifier fetches
 * them from `EXPECTED.repository` by URL, so it checks the public history and tags
 * whatever the checkout's `origin` is (for example `sdks-internal`).
 */
const PUBLIC_REFS = "refs/remotes/morpho-org-sdks";
const PUBLIC_MAIN = "morpho-org-sdks/main";
const PUBLIC_NEXT = "morpho-org-sdks/next";

/**
 * Fetches the release branches and tags of the public repository.
 *
 * @param cwd The checkout to fetch into.
 * @param repository The repository URL; the public repository outside tests.
 * @internal
 */
export function fetchReleaseRefs(
  cwd: string,
  repository: string = EXPECTED.repository,
): void {
  const unshallow =
    execGit(["rev-parse", "--is-shallow-repository"], cwd).trim() === "true";
  try {
    execGit(
      [
        "fetch",
        ...(unshallow ? ["--unshallow"] : []),
        repository,
        `+refs/heads/main:${PUBLIC_REFS}/main`,
        `+refs/heads/next:${PUBLIC_REFS}/next`,
        "--tags",
        "--force",
      ],
      cwd,
    );
  } catch (error) {
    if (
      !isGitCommandError(
        error,
        /(?:couldn't|could not) find remote ref (?:refs\/heads\/)?next\b/i,
      )
    ) {
      throw error;
    }
    execGit(
      [
        "fetch",
        ...(unshallow ? ["--unshallow"] : []),
        repository,
        `+refs/heads/main:${PUBLIC_REFS}/main`,
        "--tags",
        "--force",
      ],
      cwd,
    );
  }
}

/**
 * Determines whether a package is published from any provided repository ref.
 *
 * @param name The npm package name.
 * @param sources Package manifests loaded from release refs.
 * @returns Whether a non-private manifest matches the package name.
 */
export function isPackageKnown(
  name: string,
  sources: readonly PackageSource[],
): boolean {
  return sources.some(
    ({ manifest }) => manifest.name === name && manifest.private !== true,
  );
}

// biome-ignore lint/complexity/useMaxParams: Keep source and report state explicit.
function checkPackageKnown(
  name: string,
  sources: readonly PackageSource[],
  checks: VerificationCheck[],
  findings: VerificationFinding[],
): void {
  const known = isPackageKnown(name, sources);
  addResult(
    checks,
    findings,
    "package.known",
    "Package is published from this repository",
    known ? "pass" : "fail",
    "HIGH",
    known
      ? `${name} is a non-private package in morpho-org/sdks main or next.`
      : `${name} is not a non-private package in morpho-org/sdks main or next.`,
  );
}

/**
 * Decides whether a provenance commit is valid and reachable from release refs.
 *
 * @param commit The commit recorded by SLSA provenance.
 * @param isAncestor Whether Git confirmed it is an ancestor of main or next.
 * @returns The deterministic git.commit verdict.
 */
export function evaluateGitCommitReachability(
  commit: string | null,
  isAncestor: boolean,
): CheckEvaluation {
  if (commit == null || !/^[a-f0-9]{40,64}$/i.test(commit)) {
    return {
      status: "fail",
      severity: "CRITICAL",
      detail: `Provenance gitCommit is missing or invalid: ${commit ?? "(missing)"}.`,
    };
  }
  return isAncestor
    ? {
        status: "pass",
        severity: "CRITICAL",
        detail: `${commit} is an ancestor of a release branch.`,
      }
    : {
        status: "fail",
        severity: "CRITICAL",
        detail: `${commit} is not an ancestor of morpho-org/sdks main or next.`,
      };
}

/**
 * Decides whether the package tag points to the SLSA provenance commit.
 *
 * @param options The expected tag and resolved commit values.
 * @returns The deterministic git.tag verdict.
 */
export function evaluateGitTagDecision(options: {
  tag: string;
  taggedCommit: string | null;
  commit: string | null;
}): CheckEvaluation {
  const { tag, taggedCommit, commit } = options;
  if (taggedCommit == null) {
    return {
      status: "fail",
      severity: "HIGH",
      detail: `Tag ${tag} is missing.`,
    };
  }
  const matches =
    commit != null && taggedCommit.toLowerCase() === commit.toLowerCase();
  return {
    status: matches ? "pass" : "fail",
    severity: "HIGH",
    detail: matches
      ? `Tag ${tag} points to ${taggedCommit}.`
      : `Tag ${tag} points to ${taggedCommit}, expected ${commit ?? "(missing provenance gitCommit)"}.`,
  };
}

// biome-ignore lint/complexity/useMaxParams: Keep source and report state explicit.
function addGitCommitCheck(
  commit: string | null,
  cwd: string,
  checks: VerificationCheck[],
  findings: VerificationFinding[],
): void {
  if (commit == null || !/^[a-f0-9]{40,64}$/i.test(commit)) {
    const evaluation = evaluateGitCommitReachability(commit, false);
    addResult(
      checks,
      findings,
      "git.commit",
      "Provenance commit is reachable from a release branch",
      evaluation.status,
      evaluation.severity,
      evaluation.detail,
    );
    return;
  }
  for (const ref of [PUBLIC_MAIN, PUBLIC_NEXT]) {
    try {
      execGit(["merge-base", "--is-ancestor", commit, ref], cwd);
      const evaluation = evaluateGitCommitReachability(commit, true);
      addResult(
        checks,
        findings,
        "git.commit",
        "Provenance commit is reachable from a release branch",
        evaluation.status,
        evaluation.severity,
        `${commit} is an ancestor of ${ref}.`,
      );
      return;
    } catch (error) {
      if (
        getErrorStatus(error) === 1 ||
        isGitCommandError(
          error,
          /does not exist in|exists on disk, but not in|path .* does not exist|not a valid (?:commit|object) name|bad object/i,
        )
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
  const evaluation = evaluateGitCommitReachability(commit, false);
  addResult(
    checks,
    findings,
    "git.commit",
    "Provenance commit is reachable from a release branch",
    evaluation.status,
    evaluation.severity,
    evaluation.detail,
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
  const tag = releaseTag({ name, version });
  let taggedCommit: string;
  try {
    taggedCommit = execGit(
      ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`],
      cwd,
    ).trim();
  } catch (error) {
    if (
      !isGitCommandError(
        error,
        /Needed a single revision|unknown revision or path/i,
      )
    ) {
      addError(
        checks,
        findings,
        "git.tag",
        "Package tag points to the provenance commit",
        error,
      );
      return;
    }
    const evaluation = evaluateGitTagDecision({
      tag,
      taggedCommit: null,
      commit,
    });
    addResult(
      checks,
      findings,
      "git.tag",
      "Package tag points to the provenance commit",
      evaluation.status,
      evaluation.severity,
      evaluation.detail,
    );
    return;
  }
  const evaluation = evaluateGitTagDecision({ tag, taggedCommit, commit });
  addResult(
    checks,
    findings,
    "git.tag",
    "Package tag points to the provenance commit",
    evaluation.status,
    evaluation.severity,
    evaluation.detail,
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

/**
 * Classifies diagnostics from a failed npm audit signatures command.
 *
 * @param output Combined command output.
 * @param name The package being verified.
 * @param version The version being verified.
 * @returns The target-package, dependency-only, or command-error verdict.
 */
// biome-ignore lint/complexity/useMaxParams: Preserve the required pure evaluator signature.
export function classifyAuditSignatures(
  output: string,
  name: string,
  version: string,
): CheckEvaluation {
  if (output.includes(`${name}@${version}`) || output.includes(`"${name}"`)) {
    return {
      status: "fail",
      severity: "CRITICAL",
      detail: `npm reported a signature verification failure for ${name}@${version}: ${output.trim().slice(0, 1000)}`,
    };
  }
  if (/signature|attestation|provenance|integrity|verified/i.test(output)) {
    return {
      status: "fail",
      severity: "HIGH",
      detail: `npm reported a signature verification failure without identifying the target package: ${output.trim().slice(0, 1000)}`,
    };
  }
  return {
    status: "error",
    severity: "HIGH",
    detail:
      output.trim() || "npm audit signatures did not produce diagnostics.",
  };
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
      const evaluation = classifyAuditSignatures(output, name, version);
      if (evaluation.status === "error") {
        addError(
          checks,
          findings,
          "provenance.signatures",
          "npm signatures verify",
          new Error(`${getErrorMessage(error)}: ${evaluation.detail}`, {
            cause: error,
          }),
        );
      } else {
        addResult(
          checks,
          findings,
          "provenance.signatures",
          "npm signatures verify",
          evaluation.status,
          evaluation.severity,
          evaluation.detail,
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
  entries: TarEntry[] | null;
  irregularEntries: string[];
  manifest: RegistryManifest | null;
  manifestError: string | null;
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
      manifest: null,
      manifestError: "Tarball metadata is unavailable.",
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
    const evaluation = evaluateTarballIntegrity(bytes, integrity, tarball);
    addResult(
      checks,
      findings,
      "tarball.integrity",
      "Tarball sha512 matches registry integrity",
      evaluation.status,
      evaluation.severity,
      evaluation.detail,
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
      manifest: null,
      manifestError: getErrorMessage(error),
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
      manifest: null,
      manifestError: getErrorMessage(error),
      error: getErrorMessage(error),
    };
  }
  try {
    const tarballPath = join(tempDir, "package.tgz");
    writeFileSync(tarballPath, bytes);
    const npmRoot = execFileSync("npm", ["root", "-g"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const entries = await listTarballEntries(
      tarballPath,
      loadBundledTar(npmRoot),
    );
    const irregularEntries = entries
      .filter(({ type }) => type !== "File" && type !== "Directory")
      .map(({ path, type }) => `${path} (${type})`);
    const pacote = loadBundledPacote(npmRoot);
    let tarballManifest: RegistryManifest | null = null;
    let manifestError: string | null = null;
    try {
      const manifestValue = await pacote.manifest(`file:${tarballPath}`, {
        fullMetadata: true,
        fullReadJson: true,
      });
      if (!isRegistryManifest(manifestValue)) {
        throw new Error("The tarball package.json is not a valid manifest.");
      }
      tarballManifest = manifestValue;
    } catch (error) {
      manifestError = `${getErrorMessage(error)}${error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : ""}`;
    }
    return {
      entries,
      irregularEntries,
      manifest: tarballManifest,
      manifestError,
      error: null,
    };
  } catch (error) {
    const detail = `${getErrorMessage(error)}${error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : ""}`;
    return {
      entries: null,
      irregularEntries: [],
      manifest: null,
      manifestError: detail,
      error: detail,
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
  const tag = releaseTag({ name, version });
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
 * Produces HIGH-or-greater errors for checks blocked by a missing registry manifest.
 *
 * @returns The unavailable-manifest checks and findings.
 */
export function evaluateMissingManifest(): {
  checks: VerificationCheck[];
  findings: VerificationFinding[];
} {
  const checks: VerificationCheck[] = [];
  const findings: VerificationFinding[] = [];
  const unavailableChecks = [
    ["tarball.integrity", "Tarball sha512 matches registry integrity"],
    ["tarball.layout", "Tarball entries are rooted under package"],
    ["provenance.present", "SLSA provenance is present"],
    [
      "provenance.signature",
      "SLSA statement is signed by the expected workflow identity",
    ],
    ["provenance.subject", "Provenance subject matches package integrity"],
    ["provenance.source", "Provenance identifies the trusted source workflow"],
    ["provenance.signatures", "npm signatures verify"],
    ["registry.trusted-publisher", "Registry declares a trusted publisher"],
    ["manifest.registry-drift", "Tarball manifest matches registry manifest"],
    ["manifest.install-scripts", "Package has no install-time lifecycle hooks"],
    ["manifest.bin", "Package exposes a command-line binary"],
    ["manifest.dependencies", "Published dependency declarations match source"],
    ["manifest.files", "Tarball files match the source files allowlist"],
    [
      "manifest.identity",
      "Package identity is unchanged from previous version",
    ],
  ] as const;
  for (const [id, title] of unavailableChecks) {
    addError(
      checks,
      findings,
      id,
      title,
      new Error("Requested registry manifest is unavailable."),
    );
  }
  return { checks, findings };
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
      mainSources = readPackageSourcesAtRef(PUBLIC_MAIN, cwd);
      let nextSources: PackageSource[] = [];
      try {
        execGit(["rev-parse", "--verify", "--quiet", PUBLIC_NEXT], cwd);
        nextSources = readPackageSourcesAtRef(PUBLIC_NEXT, cwd);
      } catch (error) {
        if (
          getErrorStatus(error) !== 1 &&
          !isGitCommandError(
            error,
            /does not exist in|exists on disk, but not in|path .* does not exist|not a valid (?:commit|object) name|bad object/i,
          )
        ) {
          throw error;
        }
      }
      checkPackageKnown(
        name,
        [...mainSources, ...nextSources],
        checks,
        findings,
      );
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
    const unavailableEvaluation = evaluateMissingManifest();
    checks.push(...unavailableEvaluation.checks);
    findings.push(...unavailableEvaluation.findings);
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
    const trustedPublisherEvaluation = evaluateTrustedPublisher(
      manifest._npmUser?.trustedPublisher,
    );
    checks.push(...trustedPublisherEvaluation.checks);
    findings.push(...trustedPublisherEvaluation.findings);
    previousVersion = selectPreviousVersion(packument, version);
    const publishTimeEvaluation = evaluatePublishTime(
      packument.time?.[version],
    );
    checks.push(...publishTimeEvaluation.checks);
    findings.push(...publishTimeEvaluation.findings);

    const tarballResult = await checkTarball(manifest, checks, findings);
    const tarballEntries = tarballResult.entries;
    const archiveEntries = tarballEntries?.map(({ path }) => path) ?? null;
    const tarballManifest = tarballResult.manifest;
    if (tarballEntries == null) {
      addError(
        checks,
        findings,
        "tarball.layout",
        "Tarball entries are rooted at package/",
        new Error(
          `Tarball entries are unavailable: ${tarballResult.error ?? "unknown error"}`,
        ),
      );
    } else {
      const layoutEvaluation = evaluateTarballLayout(tarballEntries);
      checks.push(...layoutEvaluation.checks);
      findings.push(...layoutEvaluation.findings);
    }

    if (tarballManifest == null) {
      addError(
        checks,
        findings,
        "manifest.registry-drift",
        "Registry and tarball manifests agree",
        new Error(
          `The tarball manifest is unavailable: ${tarballResult.manifestError ?? "unknown error"}`,
        ),
      );
    } else {
      const registryManifestEvaluation = evaluateRegistryManifest(
        manifest,
        tarballManifest,
      );
      checks.push(...registryManifestEvaluation.checks);
      findings.push(...registryManifestEvaluation.findings);
    }

    if (archiveEntries == null || tarballManifest == null) {
      addError(
        checks,
        findings,
        "manifest.install-scripts",
        "Package has no install-time lifecycle hooks",
        new Error(
          `The tarball manifest or entries are unavailable: ${tarballResult.manifestError ?? tarballResult.error ?? "unknown error"}`,
        ),
      );
      if (archiveEntries == null) {
        addError(
          checks,
          findings,
          "manifest.files",
          "Tarball files match the source files allowlist",
          new Error(
            `Tarball entries are unavailable: ${tarballResult.error ?? "unknown error"}`,
          ),
        );
      }
    } else {
      const installProblems = findInstallProblems(
        tarballManifest.scripts,
        tarballManifest.gypfile,
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

    if (tarballManifest == null) {
      addError(
        checks,
        findings,
        "manifest.bin",
        "Package exposes a command-line binary",
        new Error(
          `The tarball manifest is unavailable: ${tarballResult.manifestError ?? "unknown error"}`,
        ),
      );
    } else {
      const manifestBinEvaluation = evaluateManifestBin(tarballManifest.bin);
      checks.push(...manifestBinEvaluation.checks);
      findings.push(...manifestBinEvaluation.findings);
    }

    if (publishTimeEvaluation.valid && previousVersion == null) {
      addResult(
        checks,
        findings,
        "manifest.identity",
        "Package identity is unchanged from previous version",
        "pass",
        "MEDIUM",
        "No previous version exists on the same release channel; identity comparison was skipped.",
      );
    } else if (publishTimeEvaluation.valid && previousVersion != null) {
      const previousManifest = packument.versions?.[previousVersion];
      if (previousManifest == null) {
        addError(
          checks,
          findings,
          "manifest.identity",
          "Package identity is unchanged from previous version",
          new Error(`Previous manifest ${previousVersion} is missing.`),
        );
      } else if (tarballManifest == null) {
        addError(
          checks,
          findings,
          "manifest.identity",
          "Package identity is unchanged from previous version",
          new Error(
            `The tarball manifest is unavailable: ${tarballResult.manifestError ?? "unknown error"}`,
          ),
        );
      } else {
        const identityMismatches = compareManifestIdentity(
          tarballManifest,
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
      const evaluation = await evaluateProvenance(
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
        const evaluation = await evaluateProvenance(
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
          "provenance.signature",
          "SLSA statement is signed by the expected workflow identity",
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
      if (tarballManifest == null) {
        addError(
          checks,
          findings,
          "manifest.dependencies",
          "Published dependency declarations match source",
          new Error(
            `The tarball manifest is unavailable: ${tarballResult.manifestError ?? "unknown error"}`,
          ),
        );
      } else {
        try {
          if (gitCommit == null) {
            throw new Error(
              "The catalog cannot be read without a trusted provenance commit.",
            );
          }
          const catalog = readWorkspaceCatalogAtCommit(gitCommit, cwd);
          const dependencyMismatches = compareManifestDependencies(
            tarballManifest,
            source.manifest,
            catalog,
          );
          addResult(
            checks,
            findings,
            "manifest.dependencies",
            "Published dependency declarations match source",
            dependencyMismatches.length === 0 ? "pass" : "fail",
            "HIGH",
            dependencyMismatches.length === 0
              ? "Dependency names and specifiers match the provenance commit and catalog."
              : dependencyMismatches.join("; "),
          );
        } catch (error) {
          addError(
            checks,
            findings,
            "manifest.dependencies",
            "Published dependency declarations match source",
            error,
          );
        }
      }
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
            `Unexpected entries: ${filesResult.unexpected.join(", ")}`,
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
