import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { bench, describe } from "vitest";
import { createFixtures } from "../__test__/fixtures.js";
import { SetterRatifierUtils } from "./SetterRatifierUtils.js";
import { Tree } from "./Tree.js";
import { TreeUtils } from "./TreeUtils.js";

const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const { baseOffer } = createFixtures({
  midnight: getChainAddress(ChainId.BaseMainnet, "midnight"),
  ecrecoverRatifier: getChainAddress(ChainId.BaseMainnet, "ecrecoverRatifier"),
});

const offers = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    baseOffer({
      maxAssets: 0n,
      ratifier: setterRatifier,
      maxUnits: BigInt(index + 1),
    }),
  );

for (const count of [16, 128, 1024, 2048]) {
  describe(`${count} offers`, () => {
    const tree = Tree.create(offers(count));

    bench("buildProofs (shared layers)", () => {
      TreeUtils.buildProofs({ tree, count });
    });

    bench(
      "buildProof per leaf (rebuilds layers)",
      () => {
        for (let i = 0; i < count; i++) {
          TreeUtils.buildProof({ tree, leafIndex: i });
        }
      },
      { time: 2_000, iterations: 3 },
    );

    bench("SetterRatifierUtils.ratify", () => {
      SetterRatifierUtils.ratify({ tree });
    });
  });
}
