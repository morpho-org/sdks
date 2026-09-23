import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import type { Hash } from "viem";
import { describe, expect, test } from "vitest";
import { createFixtures, group as staleGroup } from "../__test__/fixtures.js";
import { InvalidOfferGroupError } from "../errors.js";
import { OfferUtils } from "../offers/index.js";
import { Group } from "./Group.js";
import { GroupUtils } from "./GroupUtils.js";

const { baseOfferInput } = createFixtures({
  midnight: getChainAddress(ChainId.BaseMainnet, "midnight"),
  ecrecoverRatifier: getChainAddress(ChainId.BaseMainnet, "ecrecoverRatifier"),
});

describe("Group.from", () => {
  test("default", () => {
    const offer = baseOfferInput({ maxAssets: 0n });
    const group = Group.from(offer);

    expect(group.id).toBe(GroupUtils.hash([offer]));
    expect(GroupUtils.toStructs(group)[0]!.maker).toBe(offer.maker);
  });
});

describe("GroupUtils.isGroupInput", () => {
  test("behavior: distinguishes groups from offers with incidental offers fields", () => {
    const offer = {
      ...baseOfferInput({ maxAssets: 0n }),
      offers: [baseOfferInput({ maxAssets: 0n })],
    };

    expect(GroupUtils.isGroupInput({ offers: [offer] })).toBe(true);
    expect(GroupUtils.isGroupInput(offer)).toBe(false);
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

describe("GroupUtils.hashMembers", () => {
  test("default", () => {
    const a = baseOfferInput({ maxAssets: 0n });
    const b = baseOfferInput({ maxAssets: 0n, maxUnits: 7n });

    expect(
      GroupUtils.hashMembers([
        OfferUtils.groupHash(a),
        OfferUtils.groupHash(b),
      ]),
    ).toBe(GroupUtils.hash([a, b]));
    expect(
      GroupUtils.hashMembers([
        OfferUtils.groupHash(b),
        OfferUtils.groupHash(a),
      ]),
    ).toBe(GroupUtils.hash([a, b]));
  });

  test("behavior: ignores member hash casing", () => {
    const hashes = [
      OfferUtils.groupHash(baseOfferInput({ maxAssets: 0n })),
      OfferUtils.groupHash(baseOfferInput({ maxAssets: 0n, maxUnits: 7n })),
    ];
    const upper = hashes.map((h) => `0x${h.slice(2).toUpperCase()}` as Hash);

    expect(GroupUtils.hashMembers(upper)).toBe(GroupUtils.hashMembers(hashes));
    expect(GroupUtils.hashMembers([...upper].reverse())).toBe(
      GroupUtils.hashMembers(hashes),
    );
  });

  test("error: InvalidOfferGroupError", () => {
    expect(() => GroupUtils.hashMembers([])).toThrow(InvalidOfferGroupError);
  });
});
