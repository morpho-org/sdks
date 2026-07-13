import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { describe, expect, test } from "vitest";
import { createFixtures, group as staleGroup } from "../__test__/fixtures.js";
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
