import { describe, expect, test } from "vitest";

import {
  aggregateSeverity,
  checkTarballFiles,
  compareManifestDependencies,
  compareManifestIdentity,
  evaluateProvenance,
  findInstallProblems,
  findInstallScripts,
  hasManifestBin,
  integrityToSha512Hex,
  selectPreviousVersion,
} from "./verify-npm-release.ts";

const integrity = `sha512-${Buffer.alloc(64, 42).toString("base64")}`;
const digestHex = Buffer.alloc(64, 42).toString("hex");

function statement(
  overrides: {
    repository?: string;
    repositoryId?: string;
    workflowPath?: string;
    ref?: string;
    event?: string;
    builder?: string;
    subjectDigest?: string;
  } = {},
) {
  return {
    subject: [{ digest: { sha512: overrides.subjectDigest ?? digestHex } }],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            ref: overrides.ref ?? "refs/heads/main",
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
        resolvedDependencies: [
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

function attestations(value: ReturnType<typeof statement>) {
  return [
    {
      predicateType: "https://slsa.dev/provenance/v1",
      bundle: {
        dsseEnvelope: {
          payload: Buffer.from(JSON.stringify(value)).toString("base64"),
        },
      },
    },
  ];
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

describe("evaluateProvenance", () => {
  test("accepts the expected GitHub Actions SLSA provenance shape", () => {
    const result = evaluateProvenance(
      "https://registry.npmjs.org/attestations",
      attestations(statement()),
      integrity,
    );
    expect(result.findings).toEqual([]);
    expect(result.gitCommit).toBe("bedd89c1".padEnd(40, "0"));
  });

  test.each([
    ["wrong repository", { repository: "https://github.com/other/repo" }],
    ["wrong repository_id", { repositoryId: "123" }],
    ["wrong workflow path", { workflowPath: ".github/workflows/publish.yml" }],
    ["feature ref", { ref: "refs/heads/feature" }],
    ["wrong event", { event: "pull_request" }],
    ["self-hosted builder", { builder: "https://example.com/self-hosted" }],
  ])("fails CRITICAL for %s", (_case, overrides) => {
    const result = evaluateProvenance(
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

  test("fails CRITICAL for a subject digest mismatch", () => {
    const result = evaluateProvenance(
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

  test("fails CRITICAL when the attestations response has no SLSA v1 statement", () => {
    const result = evaluateProvenance(
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
  });
});

describe("compareManifestDependencies", () => {
  test("allows a published semver for a workspace dependency", () => {
    expect(
      compareManifestDependencies(
        { dependencies: { "@morpho-org/blue-sdk": "^1.2.3" } },
        { dependencies: { "@morpho-org/blue-sdk": "workspace:^" } },
      ),
    ).toEqual([]);
  });

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

  test("returns null when there is no earlier eligible version", () => {
    expect(selectPreviousVersion(packument, "1.0.0")).toBeNull();
  });
});
