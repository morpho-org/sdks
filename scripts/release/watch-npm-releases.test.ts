import { describe, expect, test } from "vitest";

import {
  findMissingReleases,
  releaseIssueTitle,
  renderReleaseIssueBody,
  selectRecentVersions,
} from "./watch-npm-releases.ts";

describe("selectRecentVersions", () => {
  const nowMs = Date.parse("2026-09-29T12:00:00.000Z");
  const packument = {
    versions: {
      "1.0.0": {},
      "1.0.1": {},
      "1.0.2": {},
      "1.0.3": {},
      "1.0.5": {},
      "1.0.6": {},
    },
    time: {
      created: "2026-09-29T11:00:00.000Z",
      modified: "2026-09-29T11:59:00.000Z",
      "1.0.0": "2026-09-29T10:00:00.000Z",
      "1.0.1": "2026-09-29T11:00:00.000Z",
      "1.0.2": "2026-09-29T12:00:00.000Z",
      "1.0.3": "2026-09-29T11:30:00.000Z",
      "1.0.4": "2026-09-29T11:45:00.000Z",
      "1.0.5": "2026-09-29T12:01:00.000Z",
    },
  };

  test("includes both window boundaries and requires a matching manifest and time", () => {
    expect(
      selectRecentVersions(packument, nowMs, 60 * 60 * 1000).map(
        ({ version }) => version,
      ),
    ).toEqual(["1.0.1", "1.0.3", "1.0.2", "1.0.5"]);
  });

  test("ignores created and modified metadata", () => {
    expect(
      selectRecentVersions(packument, nowMs, 24 * 60 * 60 * 1000).map(
        ({ version }) => version,
      ),
    ).not.toContain("created");
    expect(
      selectRecentVersions(packument, nowMs, 24 * 60 * 60 * 1000).map(
        ({ version }) => version,
      ),
    ).not.toContain("modified");
  });
});

describe("release issues", () => {
  test("uses the exact release issue title", () => {
    expect(releaseIssueTitle("@morpho-org/blue-sdk", "7.1.0")).toBe(
      "npm release: @morpho-org/blue-sdk@7.1.0",
    );
  });

  test("renders all required release metadata", () => {
    const body = renderReleaseIssueBody({
      name: "@morpho-org/blue-sdk",
      version: "7.1.0",
      publishTime: "2026-09-29T12:00:00.000Z",
      distTags: ["latest"],
      integrity: "sha512-abc",
      tarball: "https://registry.npmjs.org/package.tgz",
      attestationsUrl: "https://registry.npmjs.org/attestations",
      trustedPublisherPresent: true,
    });
    expect(body).toContain("- Package: `@morpho-org/blue-sdk`");
    expect(body).toContain("- Version: `7.1.0`");
    expect(body).toContain("- Publish time: 2026-09-29T12:00:00.000Z");
    expect(body).toContain("Dist-tags pointing to this version: latest");
    expect(body).toContain("- Integrity: `sha512-abc`");
    expect(body).toContain("- Tarball: https://registry.npmjs.org/package.tgz");
    expect(body).toContain(
      "- Attestations: https://registry.npmjs.org/attestations",
    );
    expect(body).toContain("Trusted publisher present: yes");
    expect(body).toContain("A Devin Automation verifies this release");
  });

  test("deduplicates candidates by exact title", () => {
    const releases = [
      { name: "@morpho-org/blue-sdk", version: "7.1.0" },
      { name: "@morpho-org/blue-sdk", version: "7.1.1" },
    ];
    expect(
      findMissingReleases(releases, [
        "npm release: @morpho-org/blue-sdk@7.1.0",
      ]),
    ).toEqual([releases[1]]);
  });
});
