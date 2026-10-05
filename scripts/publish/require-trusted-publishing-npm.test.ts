import { describe, expect, test } from "vitest";

import { assertTrustedPublishingNpm } from "./require-trusted-publishing-npm.ts";

describe("assertTrustedPublishingNpm", () => {
  test.each(["11.5.1", "11.6.0", "12.0.0", "11.10.0\n", "11.5.2-pre.1"])(
    "accepts %j",
    (version) => {
      expect(() => assertTrustedPublishingNpm(version)).not.toThrow();
    },
  );

  test.each(["11.5.0", "11.4.9", "10.9.9", "9.99.99"])(
    "rejects %s",
    (version) => {
      expect(() => assertTrustedPublishingNpm(version)).toThrow("older than");
    },
  );

  test.each(["", "11.5", "v11.5.1", "eleven"])(
    "rejects malformed %j",
    (version) => {
      expect(() => assertTrustedPublishingNpm(version)).toThrow("Unrecognized");
    },
  );
});
