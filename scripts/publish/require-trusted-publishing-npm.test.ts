import { describe, expect, test } from "vitest";

import { assertTrustedPublishingNpm } from "./require-trusted-publishing-npm.ts";

describe("assertTrustedPublishingNpm", () => {
  test.each(["11.21.0", "11.22.0", "12.2.0", "12.3.0", "11.21.0\n", "13.0.0"])(
    "accepts %j",
    (version) => {
      expect(() => assertTrustedPublishingNpm(version)).not.toThrow();
    },
  );

  test.each(["11.20.0", "11.5.1", "12.0.0", "12.1.9", "10.9.9", "9.99.99"])(
    "rejects %s",
    (version) => {
      expect(() => assertTrustedPublishingNpm(version)).toThrow("older than");
    },
  );

  test.each(["", "11.5", "v11.21.0", "eleven", "11.21.0-pre.1"])(
    "rejects malformed %j",
    (version) => {
      expect(() => assertTrustedPublishingNpm(version)).toThrow("Unrecognized");
    },
  );
});
