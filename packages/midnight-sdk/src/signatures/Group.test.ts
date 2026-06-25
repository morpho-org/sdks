import { describe, expect, test } from "vitest";
import { baseOffer } from "../__test__/fixtures.js";
import { InvalidOfferGroupError } from "../errors.js";
import { Group } from "./Group.js";
import { GroupUtils } from "./GroupUtils.js";

describe("Group.create", () => {
  test("default", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);

    expect(group.offers).toHaveLength(1);
    expect(group.offers[0]).not.toBe(offer);
    expect(group.offers[0]!.group).toBe(group.id);
    expect(group.offers[0]!.tick).toBe(offer.tick);
    expect(group.id).toBe(GroupUtils.hash([offer]));
  });

  test("behavior: accepts iterable offer input", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create(new Set([offer]));

    expect(group.offers).toHaveLength(1);
    expect(group.offers[0]!.group).toBe(group.id);
  });

  test("behavior: group id is independent of offer order", () => {
    const first = baseOffer({ maxAssets: 0n, tick: 5_000n });
    const second = baseOffer({ maxAssets: 0n, tick: 5_004n });

    expect(GroupUtils.hash([first, second])).toBe(
      GroupUtils.hash([second, first]),
    );
    const group = Group.create([first, second]);

    expect(group.offers.map((offer) => offer.tick)).toEqual([
      first.tick,
      second.tick,
    ]);
    expect(group.offers.every((offer) => offer.group === group.id)).toBe(true);
  });

  test("behavior: group id and offers are stable after construction", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);
    const initialId = group.id;

    Object.assign(offer, { tick: 5_004n });

    expect(group.id).toBe(initialId);
    expect(group.offers[0]!.tick).toBe(5_000n);
  });

  test("error: InvalidOfferGroupError for mismatched cap value", () => {
    expect(() =>
      Group.create([
        baseOffer({ maxAssets: 0n, maxUnits: 100n }),
        baseOffer({ maxAssets: 0n, maxUnits: 101n }),
      ]),
    ).toThrow(InvalidOfferGroupError);
  });
});
