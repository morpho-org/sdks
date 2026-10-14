import {
  ChainId,
  getChainAddress,
  MidnightPositionLib,
} from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { encodeAbiParameters, keccak256, toHex } from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import { midnightAbi } from "../src/abis.js";
import { fetchAccrualPosition } from "../src/fetch/Position.js";
import { MarketUtils } from "../src/market/MarketUtils.js";
import { PositionUtils } from "../src/position/PositionUtils.js";

const forkBlockNumber = 52_513_513n;
const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber,
  stepsTracing: false,
});

const positions = [
  {
    name: "pre-maturity",
    marketId:
      "0x6cb9f4a081803895ee5f8cb611c9a7ad7ccadd88d8a8343f478d9e5646efecac",
    user: "0x5e77e718b97dac27474b78784966a449d2a3968a",
  },
  {
    name: "pre-maturity with pending fee",
    marketId:
      "0x6cb9f4a081803895ee5f8cb611c9a7ad7ccadd88d8a8343f478d9e5646efecac",
    user: "0x5e77e718b97dac27474b78784966a449d2a3968a",
  },
  {
    name: "post-maturity",
    marketId:
      "0xa3832bcee29e396d6027f1343ff4589f45f1a47b996e3e3457b43fe68206b108",
    user: "0x68dcd471d1244C6eD7D3759E853C612F3806006e",
  },
  {
    name: "increased loss factor",
    marketId:
      "0xe3045f234b57647db1490129ab744992049f14fdf0db4c752ea802a68ac6bb84",
    user: "0xbDE28a4c262dFE3eA37794421E32b7BB5A113949",
  },
] as const;

describe("PositionUtils.accrueInterest on a Base fork", () => {
  for (const position of positions) {
    test(`matches Midnight.updatePositionView for a ${position.name} position`, async ({
      client,
    }) => {
      let fetched = await fetchAccrualPosition(client, {
        marketId: position.marketId,
        user: position.user,
      });
      expect(fetched.credit).toBeGreaterThan(0n);

      if (position.name === "pre-maturity with pending fee") {
        const original = fetched;
        const pendingFee = fetched.credit / 10n;
        expect(pendingFee).toBeGreaterThan(0n);
        expect(pendingFee).toBeLessThanOrEqual(fetched.credit);
        const positionMappingBaseSlot = 0n;
        // Midnight.position maps market ids and users to Position at storage slot 0.
        const marketPositionSlot = keccak256(
          encodeAbiParameters(
            [{ type: "bytes32" }, { type: "uint256" }],
            [position.marketId, positionMappingBaseSlot],
          ),
        );
        const positionSlot = keccak256(
          encodeAbiParameters(
            [{ type: "address" }, { type: "bytes32" }],
            [position.user, marketPositionSlot],
          ),
        );
        const storageValue = await client.getStorageAt({
          address: midnight,
          slot: positionSlot,
        });
        if (storageValue === undefined) {
          throw new Error("Midnight position storage is missing");
        }
        const storageWord = BigInt(storageValue);
        const creditMask = (1n << 128n) - 1n;
        expect(storageWord & creditMask).toBe(fetched.credit);
        await client.setStorageAt({
          address: midnight,
          index: positionSlot,
          value: toHex((storageWord & creditMask) | (pendingFee << 128n), {
            size: 32,
          }),
        });

        fetched = await fetchAccrualPosition(client, {
          marketId: position.marketId,
          user: position.user,
        });
        expect(fetched.pendingFee).toBe(pendingFee);
        expect(fetched.credit).toBe(original.credit);
        expect(fetched.lastAccrual).toBe(original.lastAccrual);
        expect(fetched.lastLossFactor).toBe(original.lastLossFactor);
        expect(fetched.lastAccrual).toBeLessThan(
          fetched.market.params.maturity,
        );
      }

      const block = await client.getBlock({ blockTag: "latest" });
      const timestamp = block.timestamp;

      if (
        position.name === "pre-maturity" ||
        position.name === "pre-maturity with pending fee"
      ) {
        expect(fetched.market.params.maturity).toBeGreaterThan(timestamp);
      } else if (position.name === "post-maturity") {
        expect(fetched.market.params.maturity).toBeLessThanOrEqual(timestamp);
      } else {
        expect(fetched.market.lossFactor).toBeGreaterThan(
          fetched.lastLossFactor,
        );
      }

      const accrued = PositionUtils.accrueInterest({
        position: fetched,
        market: fetched.market,
        timestamp,
      });
      if (position.name === "pre-maturity with pending fee") {
        expect(accrued.accruedFee).toBeGreaterThan(0n);
      }
      const shared = MidnightPositionLib.accrue({
        credit: fetched.credit,
        pendingFee: fetched.pendingFee,
        lastLossFactor: fetched.lastLossFactor,
        lastAccrual: fetched.lastAccrual,
        marketLossFactor: fetched.market.lossFactor,
        maturity: fetched.market.params.maturity,
        timestamp,
      });
      const onchain = await client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "updatePositionView",
        args: [
          MarketUtils.toStruct(fetched.market.params),
          position.marketId,
          position.user,
        ],
      });

      expect([
        accrued.position.credit,
        accrued.position.pendingFee,
        accrued.accruedFee,
      ]).toEqual(onchain);
      expect([shared.credit, shared.pendingFee, shared.accruedFee]).toEqual(
        onchain,
      );
    });
  }
});
