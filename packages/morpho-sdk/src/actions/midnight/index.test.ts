import { expect, test } from "vitest";
import * as midnight from "./index.js";

test("parsed contracts and encoders stay outside the public barrel", () => {
  expect(
    Object.keys(midnight).filter(
      (name) => name.startsWith("parse") || name.startsWith("encode"),
    ),
  ).toEqual([]);
});
