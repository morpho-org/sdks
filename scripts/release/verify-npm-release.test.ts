import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import {
  aggregateSeverity,
  checkTarballFiles,
  classifyAuditSignatures,
  compareManifestDependencies,
  compareManifestIdentity,
  compareRegistryManifest,
  evaluateGitCommitReachability,
  evaluateGitTagDecision,
  evaluateManifestBin,
  evaluateMissingManifest,
  evaluateProvenance as evaluateProvenanceWithSigstore,
  evaluatePublishTime,
  evaluateRegistryManifest,
  evaluateTarballIntegrity,
  evaluateTarballLayout,
  evaluateTrustedPublisher,
  fetchReleaseRefs,
  findInstallProblems,
  findInstallScripts,
  hasManifestBin,
  integrityToSha512Hex,
  isPackageKnown,
  selectPreviousVersion,
} from "./verify-npm-release.ts";

const integrity = `sha512-${Buffer.alloc(64, 42).toString("base64")}`;
const digestHex = Buffer.alloc(64, 42).toString("hex");
const payloadType = "application/vnd.in-toto+json";

function statement(
  overrides: {
    repository?: string;
    repositoryId?: string;
    workflowPath?: string;
    ref?: string;
    event?: string;
    builder?: string;
    subjectDigest?: string;
    workflowRef?: string;
    omitResolvedDependencies?: boolean;
  } = {},
) {
  return {
    subject: [{ digest: { sha512: overrides.subjectDigest ?? digestHex } }],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            ref: overrides.workflowRef ?? overrides.ref ?? "refs/heads/main",
            repository:
              overrides.repository ?? "https://github.com/morpho-org/sdks",
            path: overrides.workflowPath ?? ".github/workflows/push.yml",
          },
        },
        internalParameters: {
          github: {
            event_name: overrides.event ?? "push",
            repository_id: overrides.repositoryId ?? "829304716",
          },
        },
        resolvedDependencies: overrides.omitResolvedDependencies
          ? []
          : [
              {
                uri: "git+https://github.com/morpho-org/sdks@refs/heads/main",
                digest: { gitCommit: "bedd89c1".padEnd(40, "0") },
              },
            ],
      },
      runDetails: {
        builder: {
          id:
            overrides.builder ??
            "https://github.com/actions/runner/github-hosted",
        },
      },
    },
  };
}

function attestations(
  value: ReturnType<typeof statement>,
  options: {
    payload?: Buffer;
  } = {},
) {
  const payload = options.payload ?? Buffer.from(JSON.stringify(value));
  return [
    {
      predicateType: "https://slsa.dev/provenance/v1",
      bundle: {
        verificationMaterial: {
          certificate: { rawBytes: "dGVzdA==" },
        },
        dsseEnvelope: {
          payload: payload.toString("base64"),
          payloadType,
          signatures: [
            { sig: Buffer.from("test signature").toString("base64") },
          ],
        },
      },
    },
  ];
}

type TestBundleVerifier = NonNullable<
  NonNullable<
    Parameters<typeof evaluateProvenanceWithSigstore>[3]
  >["verifyBundle"]
>;

const mainSigner = {
  identity: {
    subjectAlternativeName:
      "https://github.com/morpho-org/sdks/.github/workflows/publish.yml@refs/heads/main",
  },
};

const testBundleVerifier: TestBundleVerifier = async () => mainSigner;

// biome-ignore lint/complexity/useMaxParams: Keep fixture adapter aligned with the evaluator.
function evaluateProvenance(
  attestationsUrl: string | undefined,
  attestationValues: Parameters<typeof evaluateProvenanceWithSigstore>[1],
  packageIntegrity: string,
  verifyBundle: TestBundleVerifier = testBundleVerifier,
) {
  return evaluateProvenanceWithSigstore(
    attestationsUrl,
    attestationValues,
    packageIntegrity,
    { verifyBundle },
  );
}

describe("integrityToSha512Hex", () => {
  test("converts a valid integrity digest", () => {
    expect(integrityToSha512Hex(integrity)).toBe(digestHex);
  });

  test("rejects malformed or non-sha512 integrity values", () => {
    expect(integrityToSha512Hex("sha256-abc")).toBeNull();
    expect(integrityToSha512Hex("sha512-abc")).toBeNull();
  });
});

describe("pure verifier decisions", () => {
  test("evaluates tarball integrity and registry origin", () => {
    const bytes = Buffer.from("package tarball");
    const digest = createHash("sha512").update(bytes).digest("base64");
    const url = "https://registry.npmjs.org/package/-/package-1.0.0.tgz";
    expect(
      evaluateTarballIntegrity(bytes, `sha512-${digest}`, url).status,
    ).toBe("pass");
    expect(
      evaluateTarballIntegrity(
        Buffer.from("tampered tarball"),
        `sha512-${digest}`,
        url,
      ),
    ).toMatchObject({ status: "fail", severity: "CRITICAL" });
    expect(
      evaluateTarballIntegrity(
        bytes,
        `sha512-${digest}`,
        "https://evil.test/x",
      ),
    ).toMatchObject({ status: "error", severity: "HIGH" });
  });

  test("classifies target, dependency-only, and command failures", () => {
    expect(
      classifyAuditSignatures(
        "signature verification failed for @morpho-org/blue-sdk@7.1.0",
        "@morpho-org/blue-sdk",
        "7.1.0",
      ),
    ).toMatchObject({ status: "fail", severity: "CRITICAL" });
    expect(
      classifyAuditSignatures(
        "dependency signature verification failed",
        "@morpho-org/blue-sdk",
        "7.1.0",
      ),
    ).toMatchObject({ status: "fail", severity: "HIGH" });
    expect(
      classifyAuditSignatures(
        "npm exited before producing audit output",
        "@morpho-org/blue-sdk",
        "7.1.0",
      ),
    ).toMatchObject({ status: "error", severity: "HIGH" });
  });

  test("decides commit ancestry and package tag outcomes", () => {
    const commit = "a".repeat(40);
    expect(evaluateGitCommitReachability(commit, true).status).toBe("pass");
    expect(evaluateGitCommitReachability(commit, false)).toMatchObject({
      status: "fail",
      severity: "CRITICAL",
    });
    expect(
      evaluateGitTagDecision({
        tag: "@morpho-org/blue-sdk-v1.0.0",
        taggedCommit: commit,
        commit,
      }).status,
    ).toBe("pass");
    expect(
      evaluateGitTagDecision({
        tag: "@morpho-org/blue-sdk-v1.0.0",
        taggedCommit: "b".repeat(40),
        commit,
      }),
    ).toMatchObject({ status: "fail", severity: "HIGH" });
  });

  test("fans out HIGH errors for every manifest-dependent check", () => {
    const evaluation = evaluateMissingManifest();
    const expectedIds = [
      "tarball.integrity.error",
      "tarball.layout.error",
      "provenance.present.error",
      "provenance.signature.error",
      "provenance.subject.error",
      "provenance.source.error",
      "provenance.signatures.error",
      "registry.trusted-publisher.error",
      "manifest.registry-drift.error",
      "manifest.install-scripts.error",
      "manifest.bin.error",
      "manifest.dependencies.error",
      "manifest.files.error",
      "manifest.identity.error",
    ];
    expect(evaluation.checks.map(({ id }) => id)).toEqual(expectedIds);
    expect(evaluation.findings).toHaveLength(expectedIds.length);
    expect(
      evaluation.findings.every(
        ({ severity }) => severity === "HIGH" || severity === "CRITICAL",
      ),
    ).toBe(true);
  });
});

describe("release CLI arguments", () => {
  const script = fileURLToPath(
    new URL("./verify-npm-release.ts", import.meta.url),
  );

  test.each(["@other/blue-sdk@7.1.0", "@morpho-org/blue-sdk@7.1"])(
    "rejects invalid release spec %s with usage exit 2",
    (spec) => {
      let exitCode: number | null = null;
      try {
        execFileSync(process.execPath, [script, spec], {
          encoding: "utf8",
        });
      } catch (error) {
        exitCode =
          typeof error === "object" && error != null && "status" in error
            ? Number(error.status)
            : null;
      }
      expect(exitCode).toBe(2);
    },
  );
});

describe("evaluateProvenance", () => {
  test("accepts the expected GitHub Actions SLSA provenance shape", async () => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(statement()),
      integrity,
    );
    expect(result.findings).toEqual([]);
    expect(result.gitCommit).toBe("bedd89c1".padEnd(40, "0"));
    expect(
      result.checks.find(({ id }) => id === "provenance.signature"),
    ).toMatchObject({ status: "pass" });
  });

  test("accepts the public release.yml pipeline on main", async () => {
    const releaseSigner: TestBundleVerifier = async (_bundle, options) => {
      expect(options.certificateIdentityURI).toBe(
        "^https://github\\.com/morpho-org/sdks/\\.github/workflows/release\\.yml@refs/heads/main$",
      );
      return {
        identity: {
          subjectAlternativeName:
            "https://github.com/morpho-org/sdks/.github/workflows/release.yml@refs/heads/main",
        },
      };
    };
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(
        statement({ workflowPath: ".github/workflows/release.yml" }),
      ),
      integrity,
      releaseSigner,
    );
    expect(result.findings).toEqual([]);
    expect(result.gitCommit).toBe("bedd89c1".padEnd(40, "0"));
  });

  test("fails CRITICAL for release.yml on next, which only the legacy pipeline used", async () => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(
        statement({
          workflowPath: ".github/workflows/release.yml",
          ref: "refs/heads/next",
        }),
      ),
      integrity,
    );
    expect(result.gitCommit).toBeNull();
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.signature" && severity === "CRITICAL",
      ),
    ).toBe(true);
  });

  test("fails CRITICAL for a workflow path that is not a trusted publisher", async () => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(
        statement({ workflowPath: ".github/workflows/publish.yml" }),
      ),
      integrity,
    );
    expect(result.gitCommit).toBeNull();
    expect(
      result.findings.find(({ id }) => id === "provenance.signature"),
    ).toMatchObject({
      severity: "CRITICAL",
      detail: "Predicate workflow path is not a trusted publish workflow.",
    });
  });

  test("fails CRITICAL when release.yml provenance is signed by the legacy publish.yml", async () => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(
        statement({ workflowPath: ".github/workflows/release.yml" }),
      ),
      integrity,
    );
    expect(result.gitCommit).toBeNull();
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.signature" && severity === "CRITICAL",
      ),
    ).toBe(true);
  });

  test("fails CRITICAL when the signed payload is tampered with", async () => {
    const signedAttestation = attestations(statement());
    const envelope = signedAttestation[0]?.bundle?.dsseEnvelope;
    if (envelope == null) throw new Error("Test DSSE envelope is missing.");
    envelope.payload = Buffer.from(
      JSON.stringify(
        statement({ repository: "https://github.com/other/repo" }),
      ),
    ).toString("base64");
    const verifyBundle: TestBundleVerifier = async (bundle) => {
      if (
        bundle.dsseEnvelope?.payload !==
        Buffer.from(JSON.stringify(statement())).toString("base64")
      ) {
        throw Object.assign(new Error("DSSE signature is invalid."), {
          name: "VerificationError",
        });
      }
      return mainSigner;
    };

    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      signedAttestation,
      integrity,
      verifyBundle,
    );
    expect(result.gitCommit).toBeNull();
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.signature" && severity === "CRITICAL",
      ),
    ).toBe(true);
    expect(
      result.checks.find(({ id }) => id === "provenance.source.error")?.status,
    ).toBe("error");
  });

  test("fails CRITICAL when the signer SAN is not the trusted publish workflow", async () => {
    const verifyBundle: TestBundleVerifier = async () => ({
      identity: {
        subjectAlternativeName:
          "https://github.com/morpho-org/sdks/.github/workflows/publish.yml@refs/heads/feature",
      },
    });
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(statement()),
      integrity,
      verifyBundle,
    );
    expect(result.gitCommit).toBeNull();
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.signature" && severity === "CRITICAL",
      ),
    ).toBe(true);
  });

  test("fails CRITICAL when signer and caller refs differ", async () => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(statement({ workflowRef: "refs/heads/next" })),
      integrity,
    );
    expect(result.gitCommit).toBeNull();
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.signature" && severity === "CRITICAL",
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        ({ id, severity, detail }) =>
          id === "provenance.source" &&
          severity === "CRITICAL" &&
          detail.includes(
            "signer ref refs/heads/main != predicate ref refs/heads/next",
          ),
      ),
    ).toBe(true);
  });

  test("passes the exact Sigstore issuer, identity, and Fulcio OID policy", async () => {
    const bundle = attestations(statement());
    let receivedBundle: unknown;
    let receivedOptions: unknown;
    const verifyBundle: TestBundleVerifier = async (
      verifiedBundle,
      options,
    ) => {
      receivedBundle = verifiedBundle;
      receivedOptions = options;
      return mainSigner;
    };
    await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      bundle,
      integrity,
      verifyBundle,
    );
    const encode = (value: string) =>
      Buffer.concat([
        Buffer.from([0x0c, Buffer.byteLength(value)]),
        Buffer.from(value),
      ]).toString("latin1");
    expect(receivedBundle).toBe(bundle[0]?.bundle);
    expect(receivedOptions).toEqual({
      certificateIssuer: "https://token.actions.githubusercontent.com",
      certificateIdentityURI:
        "^https://github\\.com/morpho-org/sdks/\\.github/workflows/publish\\.yml@refs/heads/main$",
      certificateOIDs: {
        "1.3.6.1.4.1.57264.1.11": encode("github-hosted"),
        "1.3.6.1.4.1.57264.1.12": encode("https://github.com/morpho-org/sdks"),
        "1.3.6.1.4.1.57264.1.13": encode("bedd89c1".padEnd(40, "0")),
        "1.3.6.1.4.1.57264.1.14": encode("refs/heads/main"),
        "1.3.6.1.4.1.57264.1.15": encode("829304716"),
        "1.3.6.1.4.1.57264.1.18": encode(
          "https://github.com/morpho-org/sdks/.github/workflows/push.yml@refs/heads/main",
        ),
        "1.3.6.1.4.1.57264.1.20": encode("push"),
      },
    });
  });

  test.each([
    [
      "identity",
      Object.assign(new Error("identity mismatch"), { name: "PolicyError" }),
    ],
    [
      "signature",
      Object.assign(new Error("signature mismatch"), {
        name: "VerificationError",
      }),
    ],
  ])(
    "reports a CRITICAL verifier %s failure and withholds the commit",
    async (_case, error) => {
      const result = await evaluateProvenance(
        "https://registry.npmjs.org/attestations",
        attestations(statement()),
        integrity,
        async () => {
          throw error;
        },
      );
      expect(result.gitCommit).toBeNull();
      expect(
        result.findings.some(
          ({ id, severity }) =>
            id === "provenance.signature" && severity === "CRITICAL",
        ),
      ).toBe(true);
    },
  );

  test.each([
    [
      "module",
      Object.assign(new Error("Cannot find module sigstore"), {
        code: "MODULE_NOT_FOUND",
      }),
    ],
    [
      "network",
      Object.assign(new Error("network unavailable"), { name: "FetchError" }),
    ],
  ])("reports a HIGH Sigstore %s execution error", async (_case, error) => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(statement()),
      integrity,
      async () => {
        throw error;
      },
    );
    expect(result.gitCommit).toBeNull();
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.signature.error" && severity === "HIGH",
      ),
    ).toBe(true);
  });

  test("reports undecodable signed payloads as HIGH errors", async () => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(statement(), { payload: Buffer.from("not JSON") }),
      integrity,
    );
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.signature.error" && severity === "HIGH",
      ),
    ).toBe(true);
  });

  test("fails CRITICAL when no attestations URL is available", async () => {
    const result = await evaluateProvenance(undefined, [], integrity);
    expect(result.gitCommit).toBeNull();
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.signature" && severity === "CRITICAL",
      ),
    ).toBe(true);
  });

  test("fails CRITICAL for malformed integrity", async () => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(statement()),
      "sha512-not-a-digest",
    );
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.subject" && severity === "CRITICAL",
      ),
    ).toBe(true);
  });

  test("does not derive a commit when resolvedDependencies is absent", async () => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(statement({ omitResolvedDependencies: true })),
      integrity,
    );
    expect(result.gitCommit).toBeNull();
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.signature" && severity === "CRITICAL",
      ),
    ).toBe(true);
  });

  test.each([
    ["wrong repository", { repository: "https://github.com/other/repo" }],
    ["wrong repository_id", { repositoryId: "123" }],
    ["wrong event", { event: "pull_request" }],
    ["self-hosted builder", { builder: "https://example.com/self-hosted" }],
  ])("fails CRITICAL for %s", async (_case, overrides) => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(statement(overrides)),
      integrity,
    );
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.source" && severity === "CRITICAL",
      ),
    ).toBe(true);
  });

  test("fails CRITICAL when a feature ref is not bound to the signer", async () => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(statement({ ref: "refs/heads/feature" })),
      integrity,
    );
    expect(result.gitCommit).toBeNull();
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.signature" && severity === "CRITICAL",
      ),
    ).toBe(true);
  });

  test("fails CRITICAL for a subject digest mismatch", async () => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(statement({ subjectDigest: "00".repeat(64) })),
      integrity,
    );
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.subject" && severity === "CRITICAL",
      ),
    ).toBe(true);
  });

  test("fails CRITICAL when the attestations response has no SLSA v1 statement", async () => {
    const result = await evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      [
        {
          predicateType:
            "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
        },
      ],
      integrity,
    );
    expect(
      result.findings.some(
        ({ id, severity }) =>
          id === "provenance.present" && severity === "CRITICAL",
      ),
    ).toBe(true);
  });
});

describe("manifest lifecycle hooks and bins", () => {
  test("allows non-install scripts and rejects postinstall", () => {
    expect(
      findInstallScripts({
        prepublish: "node build",
        build: "tsc",
        test: "vitest",
      }),
    ).toEqual([]);
    expect(findInstallScripts({ postinstall: "node setup.js" })).toEqual([
      "postinstall",
    ]);
  });

  test("detects non-empty bin declarations", () => {
    expect(hasManifestBin(undefined)).toBe(false);
    expect(hasManifestBin(null)).toBe(false);
    expect(hasManifestBin({})).toBe(false);
    expect(hasManifestBin({ morpho: "" })).toBe(false);
    expect(hasManifestBin({ morpho: "bin/cli.js" })).toBe(true);
    expect(hasManifestBin("bin/cli.js")).toBe(true);
  });

  test("passes when bin is absent and fails HIGH when bin is declared", () => {
    expect(evaluateManifestBin(undefined)).toEqual({
      checks: [
        {
          id: "manifest.bin",
          status: "pass",
          detail: "The published manifest has no bin entry.",
        },
      ],
      findings: [],
    });
    expect(evaluateManifestBin({ morpho: "bin/cli.js" })).toEqual({
      checks: [
        {
          id: "manifest.bin",
          status: "fail",
          detail: "The published manifest declares at least one bin entry.",
        },
      ],
      findings: [
        {
          id: "manifest.bin",
          severity: "HIGH",
          title: "Package exposes a command-line binary",
          detail: "The published manifest declares at least one bin entry.",
        },
      ],
    });
  });

  test("detects native addon install behavior", () => {
    expect(
      findInstallProblems({ build: "tsc" }, false, ["package/lib/index.js"]),
    ).toEqual([]);
    expect(findInstallProblems({}, true, [])).toContain(
      "gypfile/binding.gyp enables npm's implicit install",
    );
    expect(findInstallProblems({}, false, ["package/binding.gyp"])).toContain(
      "gypfile/binding.gyp enables npm's implicit install",
    );
    expect(findInstallProblems({}, false, ["binding.gyp"])).toContain(
      "gypfile/binding.gyp enables npm's implicit install",
    );
  });
});

describe("trusted publisher metadata", () => {
  test("requires a trusted publisher and reports its id without restricting it", () => {
    expect(evaluateTrustedPublisher(undefined).findings).toMatchObject([
      { id: "registry.trusted-publisher", severity: "CRITICAL" },
    ]);
    expect(evaluateTrustedPublisher({ id: "not-a-fixed-id" })).toEqual({
      checks: [
        {
          id: "registry.trusted-publisher",
          status: "pass",
          detail:
            "The published manifest declares a trusted publisher (id: not-a-fixed-id).",
        },
      ],
      findings: [],
    });
  });
});

describe("tarball manifest provenance", () => {
  test("detects registry and consumer-visible manifest drift", () => {
    const registryManifest = {
      name: "@morpho-org/blue-sdk",
      version: "7.1.0",
      scripts: { postinstall: "node setup.js" },
      dependencies: { viem: "^2.0.0", zod: "^3.0.0" },
    };
    const tarballManifest = {
      name: "@morpho-org/blue-sdk",
      version: "7.1.0",
      scripts: { postinstall: "node setup.js" },
      dependencies: { zod: "^3.0.0", viem: "^2.0.0" },
    };
    expect(compareRegistryManifest(registryManifest, tarballManifest)).toEqual(
      [],
    );
    expect(
      compareRegistryManifest(registryManifest, {
        ...tarballManifest,
        scripts: { install: "node injected.js" },
      }),
    ).toContain("scripts differs between registry and tarball manifests");
    expect(
      evaluateRegistryManifest(registryManifest, {
        ...tarballManifest,
        scripts: { install: "node injected.js" },
      }),
    ).toMatchObject({
      checks: [{ id: "manifest.registry-drift", status: "fail" }],
      findings: [{ id: "manifest.registry-drift", severity: "CRITICAL" }],
    });
  });

  test("rejects entries outside the exact package root", () => {
    expect(
      evaluateTarballLayout([{ path: "package/package.json" }]).findings,
    ).toEqual([]);
    const result = evaluateTarballLayout([{ path: "zzz/binding.gyp" }]);
    expect(result.checks).toMatchObject([
      { id: "tarball.layout", status: "fail" },
    ]);
    expect(result.findings).toMatchObject([
      { id: "tarball.layout", severity: "CRITICAL" },
    ]);
  });
});

describe("compareManifestDependencies", () => {
  test("normalizes workspace shorthand and preserves explicit ranges", () => {
    expect(
      compareManifestDependencies(
        {
          dependencies: {
            caret: "^1.2.3-next.1",
            tilde: "~2.3.4",
            exact: "3.4.5",
            range: ">=4.0.0 <5.0.0",
          },
        },
        {
          dependencies: {
            caret: "workspace:^",
            tilde: "workspace:~",
            exact: "workspace:*",
            range: "workspace:>=4.0.0 <5.0.0",
          },
        },
      ),
    ).toEqual([]);
  });

  test.each(["*", "latest", ">=0.0.0", "x"])(
    "rejects %s as a published workspace caret range",
    (specifier) => {
      expect(
        compareManifestDependencies(
          { dependencies: { alpha: specifier } },
          { dependencies: { alpha: "workspace:^" } },
        ),
      ).not.toEqual([]);
    },
  );

  test("requires catalog dependencies to match the attested default catalog", () => {
    expect(
      compareManifestDependencies(
        { dependencies: { alpha: "^1.2.3", beta: "~2.3.4" } },
        { dependencies: { alpha: "catalog:", beta: "catalog:default" } },
        { alpha: "^1.2.3", beta: "~2.3.4" },
      ),
    ).toEqual([]);
    expect(
      compareManifestDependencies(
        { dependencies: { alpha: "^1.2.4" } },
        { dependencies: { alpha: "catalog:default" } },
        { alpha: "^1.2.3" },
      ),
    ).toContain("dependencies.alpha expected catalog range ^1.2.3, got ^1.2.4");
  });

  test("rejects named catalogs as unsupported", () => {
    expect(
      compareManifestDependencies(
        { dependencies: { alpha: "^1.2.3" } },
        { dependencies: { alpha: "catalog:next" } },
        { alpha: "^1.2.3" },
      ),
    ).toContain("dependencies.alpha uses unsupported catalog next");
  });

  test.each(["https://evil/x.tgz", "github:a/b", "npm:evil@1"])(
    "rejects non-range published specifier %s for workspace dependencies",
    (specifier) => {
      expect(
        compareManifestDependencies(
          { dependencies: { alpha: specifier } },
          { dependencies: { alpha: "workspace:^" } },
        ),
      ).not.toEqual([]);
    },
  );

  test("detects an added published dependency", () => {
    expect(
      compareManifestDependencies(
        { dependencies: { alpha: "^1.0.0", evil: "^1.0.0" } },
        { dependencies: { alpha: "^1.0.0" } },
      ),
    ).toContain("dependencies names expected [alpha], got [alpha, evil]");
  });

  test("requires exact published specifiers for non-workspace dependencies", () => {
    expect(
      compareManifestDependencies(
        { optionalDependencies: { alpha: "^2.0.0" } },
        { optionalDependencies: { alpha: "^1.0.0" } },
      ),
    ).toContain("optionalDependencies.alpha expected ^1.0.0, got ^2.0.0");
  });
});

describe("publish timestamp validation", () => {
  test.each([undefined, "not-a-date"])(
    "reports a HIGH identity error for missing or invalid publish time %s",
    (publishTime) => {
      expect(evaluatePublishTime(publishTime)).toMatchObject({
        valid: false,
        checks: [{ id: "manifest.identity.error", status: "error" }],
        findings: [{ id: "manifest.identity.error", severity: "HIGH" }],
      });
    },
  );

  test("accepts a finite publish time", () => {
    expect(evaluatePublishTime("2026-01-01T00:00:00.000Z")).toEqual({
      valid: true,
      checks: [],
      findings: [],
    });
  });
});

describe("compareManifestIdentity", () => {
  test("accepts unchanged repository, license, and name fields", () => {
    const manifest = {
      name: "@morpho-org/blue-sdk",
      license: "MIT",
      repository: { url: "https://github.com/morpho-org/sdks" },
    };
    expect(compareManifestIdentity(manifest, manifest)).toEqual([]);
  });

  test("reports every changed identity field", () => {
    expect(
      compareManifestIdentity(
        {
          name: "@morpho-org/blue-sdk-evil",
          license: "ISC",
          repository: { url: "https://example.com/evil" },
        },
        {
          name: "@morpho-org/blue-sdk",
          license: "MIT",
          repository: { url: "https://github.com/morpho-org/sdks" },
        },
      ),
    ).toHaveLength(3);
  });
});

describe("checkTarballFiles", () => {
  test("allows files under declared directories and standard package metadata", () => {
    expect(
      checkTarballFiles(
        [
          "package/package.json",
          "package/lib/",
          "package/lib/index.js",
          "package/README.md",
          "package/LICENSE",
          "package/CHANGELOG.md",
        ],
        ["lib"],
      ),
    ).toEqual({ unexpected: [], error: null });
  });

  test("allows simple globs and rejects an unexpected file", () => {
    expect(
      checkTarballFiles(["package/lib/index.js"], ["lib/**/*.js"]),
    ).toEqual({ unexpected: [], error: null });
    expect(checkTarballFiles(["package/evil.js"], ["lib"])).toEqual({
      unexpected: ["package/evil.js"],
      error: null,
    });
    expect(checkTarballFiles(["package/src/evil.txt"], ["src/*.js"])).toEqual({
      unexpected: ["package/src/evil.txt"],
      error: null,
    });
  });

  test("reports allowlist patterns it cannot interpret", () => {
    expect(checkTarballFiles([], ["lib/{src,test}"]).error).toContain(
      "Cannot interpret",
    );
  });

  test("rejects non-regular tarball entries", () => {
    expect(
      checkTarballFiles(
        ["package/", "package/lib/index.js"],
        ["lib"],
        ["lrwxrwxrwx package/lib/link -> index.js"],
      ).unexpected,
    ).toEqual([
      "Non-regular tarball entry: lrwxrwxrwx package/lib/link -> index.js",
    ]);
  });
});

describe("severity aggregation", () => {
  test("returns PASS for no findings and the maximum severity otherwise", () => {
    expect(aggregateSeverity([])).toBe("PASS");
    expect(
      aggregateSeverity([
        { id: "package.known", severity: "HIGH" },
        { id: "manifest.identity", severity: "MEDIUM" },
      ]),
    ).toBe("HIGH");
  });

  test("an error finding contributes HIGH severity", () => {
    expect(
      aggregateSeverity([{ id: "manifest.files.error", severity: "HIGH" }]),
    ).toBe("HIGH");
  });
});

describe("package membership", () => {
  test("recognizes a non-private package supplied by the next ref", () => {
    expect(
      isPackageKnown("@morpho-org/next-only", [
        {
          directory: "next-only",
          manifest: { name: "@morpho-org/next-only", private: false },
        },
      ]),
    ).toBe(true);
  });
});

describe("selectPreviousVersion", () => {
  const packument = {
    versions: {
      "1.0.0": {},
      "1.1.0": {},
      "1.2.0-next.0": {},
      "1.2.0": {},
      "1.2.9-next.0": {},
      "1.3.0-next.0": {},
    },
    time: {
      "1.0.0": "2026-01-01T00:00:00.000Z",
      "1.1.0": "2026-02-01T00:00:00.000Z",
      "1.2.0-next.0": "2026-02-15T00:00:00.000Z",
      "1.2.0": "2026-03-01T00:00:00.000Z",
      "1.2.9-next.0": "2026-03-10T00:00:00.000Z",
      "1.3.0-next.0": "2026-03-15T00:00:00.000Z",
    },
  };

  test("stable releases select the preceding stable version", () => {
    expect(selectPreviousVersion(packument, "1.2.0")).toBe("1.1.0");
  });

  test("prereleases select the most recently published version on next", () => {
    expect(selectPreviousVersion(packument, "1.3.0-next.0")).toBe(
      "1.2.9-next.0",
    );
  });

  test("prereleases prefer the same preid before falling back to stable", () => {
    const timeline = {
      versions: {
        "7.0.0-next.1": {},
        "7.1.0": {},
        "7.0.0-next.2": {},
        "7.0.0-beta.2": {},
      },
      time: {
        "7.0.0-next.1": "2026-01-01T00:00:00.000Z",
        "7.1.0": "2026-01-02T00:00:00.000Z",
        "7.0.0-next.2": "2026-01-03T00:00:00.000Z",
        "7.0.0-beta.2": "2026-01-04T00:00:00.000Z",
      },
    };
    expect(selectPreviousVersion(timeline, "7.0.0-next.2")).toBe(
      "7.0.0-next.1",
    );
    expect(selectPreviousVersion(timeline, "7.0.0-beta.2")).toBe("7.1.0");
  });

  test("returns null when there is no earlier eligible version", () => {
    expect(selectPreviousVersion(packument, "1.0.0")).toBeNull();
  });
});

describe("fetchReleaseRefs", () => {
  const isolatedGit = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      env: isolatedGit,
    }).trim();
  const commit = (cwd: string, message: string) =>
    git(
      cwd,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      message,
    );

  function withRepos(run: (remote: string, local: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), "verify-npm-release-"));
    try {
      const remote = join(root, "remote");
      const local = join(root, "local");
      git(root, "init", "-q", "-b", "main", remote);
      commit(remote, "release");
      git(remote, "tag", "pkg-v1.0.0");
      git(root, "init", "-q", "-b", "main", local);
      run(remote, local);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  test("fetches main and next when the repository has both", () => {
    withRepos((remote, local) => {
      git(remote, "checkout", "-q", "-b", "next");
      commit(remote, "prerelease");

      fetchReleaseRefs(local, remote);

      expect(git(local, "rev-parse", "morpho-org-sdks/main")).toBe(
        git(remote, "rev-parse", "main"),
      );
      expect(git(local, "rev-parse", "morpho-org-sdks/next")).toBe(
        git(remote, "rev-parse", "next"),
      );
    });
  });

  test("fetches main and drops a stale next when the repository has no next branch", () => {
    withRepos((remote, local) => {
      git(remote, "checkout", "-q", "-b", "next");
      commit(remote, "prerelease");
      fetchReleaseRefs(local, remote);
      git(remote, "checkout", "-q", "main");
      git(remote, "branch", "-q", "-D", "next");

      fetchReleaseRefs(local, remote);

      expect(git(local, "rev-parse", "morpho-org-sdks/main")).toBe(
        git(remote, "rev-parse", "main"),
      );
      expect(
        git(local, "for-each-ref", "refs/remotes/morpho-org-sdks/next"),
      ).toBe("");
    });
  });

  test("keeps public tags apart from the checkout's own tags and prunes deleted ones", () => {
    withRepos((remote, local) => {
      commit(local, "internal");
      git(local, "tag", "pkg-v1.0.0");
      git(local, "tag", "pkg-v0.9.0");
      const localTag = git(local, "rev-parse", "pkg-v1.0.0");

      fetchReleaseRefs(local, remote);

      expect(
        git(
          local,
          "rev-parse",
          "refs/morpho-org-sdks/tags/pkg-v1.0.0^{commit}",
        ),
      ).toBe(git(remote, "rev-parse", "pkg-v1.0.0"));
      expect(git(local, "rev-parse", "refs/tags/pkg-v1.0.0")).toBe(localTag);
      expect(
        git(local, "for-each-ref", "refs/morpho-org-sdks/tags/pkg-v0.9.0"),
      ).toBe("");

      git(remote, "tag", "-d", "pkg-v1.0.0");
      fetchReleaseRefs(local, remote);

      expect(
        git(local, "for-each-ref", "refs/morpho-org-sdks/tags/pkg-v1.0.0"),
      ).toBe("");
    });
  });
});
