import { describe, expect, test } from "vitest";
import { baseOfferInput } from "../__test__/fixtures.js";
import { GroupUtils } from "./GroupUtils.js";

describe("GroupUtils.normalize", () => {
  test("default", () => {
    const offer = baseOfferInput({ maxAssets: 0n });
    const group = GroupUtils.normalize(offer);

    expect(group.id).toBe(GroupUtils.hash([offer]));
    expect(GroupUtils.toStructs(group)[0]!.maker).toBe(offer.maker);
  });
});
