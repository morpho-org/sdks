import { describe, expect, test } from "vitest";
import { baseOfferInput, group as staleGroup } from "../__test__/fixtures.js";
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

describe("GroupUtils.toStructs", () => {
  test("behavior: derives group id from the offer list", () => {
    const offer = baseOfferInput({ group: staleGroup, maxAssets: 0n });
    const structs = GroupUtils.toStructs({ offers: [offer] });

    expect(structs[0]!.group).toBe(GroupUtils.hash([offer]));
    expect(structs[0]!.group).not.toBe(staleGroup);
  });
});
