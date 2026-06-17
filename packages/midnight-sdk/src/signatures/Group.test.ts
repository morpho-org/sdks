import { describe, expect, test } from "vitest";
import { baseOffer } from "../__test__/fixtures.js";
import { Group } from "./Group.js";
import { GroupUtils } from "./GroupUtils.js";

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

  test("behavior: group id derives from current offers", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);
    const initialId = group.id;

    Object.assign(offer, { tick: 5_004n });

    expect(group.id).not.toBe(initialId);
    expect(group.id).toBe(GroupUtils.hash([offer]));
  });
});
