import { readFileSync } from "node:fs";
import {
  checkReleaseAges,
  fetchRegistryMetadata,
  isRegistryIdentity,
  minimumReleaseAge,
  releaseAgeExceptions,
} from "./check-release-age.ts";

const root = new URL("../", import.meta.url);

/** Bun's pre-install security scanner for resolved npm packages. */
export const scanner = {
  version: "1",
  /**
   * Validates the resolved packages before Bun can install them.
   * @param input - The package identities and tarball URLs provided by Bun.
   * @returns No advisories when every package passes; throws on any failure.
   * @example await scanner.scan({ packages: [] });
   */
  async scan({
    packages,
  }: {
    readonly packages: readonly {
      readonly name: string;
      readonly version: string;
      readonly tarball: string;
    }[];
  }): Promise<[]> {
    const current = new Set<string>();
    for (const { name, version, tarball } of packages) {
      const identity = `${name}@${version}`;
      if (!isRegistryIdentity(identity))
        throw new Error("Unsupported resolution in the release-age scanner.");
      const basename = name.slice(name.lastIndexOf("/") + 1);
      if (
        tarball !==
        `https://registry.npmjs.org/${name}/-/${basename}-${version}.tgz`
      )
        throw new Error(`Non-registry resolution source for ${identity}.`);
      current.add(identity);
    }
    await checkReleaseAges({
      current,
      previous: new Set(),
      seconds: minimumReleaseAge(
        readFileSync(new URL("bunfig.toml", root), "utf8"),
      ),
      exceptions: releaseAgeExceptions(
        readFileSync(new URL("release-age-exceptions.json", root), "utf8"),
      ),
      now: Date.now(),
      fetchMetadata: fetchRegistryMetadata,
    });
    return [];
  },
};
