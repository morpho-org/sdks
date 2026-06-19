import { describe, expect, test } from "vitest";
import { baseOfferInput } from "../__test__/fixtures.js";
import { Group } from "./Group.js";
import { GroupUtils } from "./GroupUtils.js";

describe("Group.from", () => {
  test("default", () => {
    const offer = baseOfferInput({ maxAssets: 0n });
    const group = Group.from(offer);

    expect(group.id).toBe(GroupUtils.hash([offer]));
    expect(GroupUtils.toStructs(group)[0]!.maker).toBe(offer.maker);
  });
});
