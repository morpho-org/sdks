import { describe, expect, test } from "vitest";
import { baseOffer, baseOfferInput } from "../__test__/fixtures.js";
import { Group, GroupUtils } from "./GroupUtils.js";

describe("Group.create", () => {
  test("default", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);

    expect(group.offers).toHaveLength(1);
    expect(group.offers[0]).toBe(offer);
    expect(group.id).toBe(GroupUtils.hash([offer]));
  });

  test("behavior: group id is independent of offer order", () => {
    const first = baseOffer({ maxAssets: 0n, tick: 5_000n });
    const second = baseOffer({ maxAssets: 0n, tick: 5_004n });

    expect(GroupUtils.hash([first, second])).toBe(
      GroupUtils.hash([second, first]),
    );
    expect(Group.create([first, second]).offers).toEqual([first, second]);
  });

  test("behavior: accepts plain offer objects", () => {
    const offer = baseOfferInput({ maxAssets: 0n });
    const group = GroupUtils.normalize(offer);

    expect(group.id).toBe(GroupUtils.hash([offer]));
    expect(GroupUtils.toStructs(group)[0]!.maker).toBe(offer.maker);
  });
});
