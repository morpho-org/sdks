import {
  addresses,
  type ChainAddresses,
  ChainId,
  getChainAddress,
} from "@morpho-org/morpho-ts";
import { type Address, createWalletClient, custom, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { beforeAll, describe, expect, test } from "vitest";
import { MidnightApi } from "../../src/api/MidnightApi.js";
import type { MidnightApiBookMarket } from "../../src/api/types.js";
import { MempoolPayloadValidationRule } from "../../src/api/types.js";
import { MidnightMempoolValidationError } from "../../src/errors.js";
import type { IMarketParams } from "../../src/market/Market.js";
import { Offer } from "../../src/offers/Offer.js";
import { EcrecoverRatifier } from "../../src/signatures/EcrecoverRatifier.js";
import { Payload } from "../../src/signatures/Payload.js";
import { RateRatifierV1 } from "../../src/signatures/RateRatifierV1.js";
import { SetterRatifier } from "../../src/signatures/SetterRatifier.js";
import { Tree } from "../../src/signatures/Tree.js";

const chainId = ChainId.BaseMainnet;
const API_TIMEOUT = 30_000;

const account = privateKeyToAccount(generatePrivateKey());

const baseAddresses: ChainAddresses = addresses[ChainId.BaseMainnet];
const ecrecoverRatifier = getChainAddress(
  ChainId.BaseMainnet,
  "ecrecoverRatifier",
);
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");

let book: MidnightApiBookMarket;
let market: IMarketParams;
let tick: bigint;
let maxAssets: bigint;
let start: bigint;
let expiry: bigint;

const offer = (ratifier: Address) =>
  Offer.create({
    market,
    buy: true,
    maker: account.address,
    tick,
    start,
    expiry,
    ratifier,
    maxAssets,
  });

beforeAll(async () => {
  const { data: books } = await MidnightApi.fetchBooks({
    chainIds: [ChainId.BaseMainnet],
    limit: 20,
  });
  let level: MidnightApiBookMarket["bids"][number] | undefined;
  const candidate = books.find(
    (entry) =>
      (level = entry.bids.find(
        (bid) => BigInt(bid.tick) >= RateRatifierV1.MIN_TICK,
      )) != null,
  );
  if (candidate == null || level == null)
    throw new Error(
      `No Midnight book on Base with a bid at or above RateRatifierV1.MIN_TICK (${RateRatifierV1.MIN_TICK}) for the test fixture.`,
    );

  book = candidate;
  market = {
    chainId: book.chainId,
    midnight: book.midnight,
    loanToken: book.loanToken,
    collateralParams: book.collaterals.map((collateral) => ({
      token: collateral.token,
      lltv: BigInt(collateral.lltv),
      liquidationCursor: BigInt(collateral.liquidationCursor),
      oracle: collateral.oracle,
    })),
    maturity: BigInt(book.maturity),
    rcfThreshold: BigInt(book.rcfThreshold),
    enterGate: book.enterGate,
    liquidatorGate: book.liquidatorGate,
  };

  tick = BigInt(level.tick);
  maxAssets = BigInt(level.assets);

  const now = BigInt(Math.floor(Date.now() / 1000));
  start = now;
  expiry = now + 3_600n;
}, API_TIMEOUT);

describe("Tree.mempoolValidate against the Midnight API", () => {
  test(
    "validates an Ecrecover ratified offer",
    async () => {
      const tree = Tree.create({
        type: "ecrecover",
        entries: [offer(ecrecoverRatifier)],
      });
      const client = createWalletClient({
        account,
        chain: base,
        transport: custom({
          request: () => Promise.reject(new Error("No transport in test.")),
        }),
      });
      const signature = await EcrecoverRatifier.sign({
        tree: tree.toDescriptor(),
        client,
        account,
      });

      const items = await EcrecoverRatifier.ratify({
        tree: tree.toDescriptor(),
        account,
        signature,
      });
      expect(items).toHaveLength(1);
      expect(items[0]!.ratifierData).not.toBe("0x");

      const result = await MidnightApi.validateMempoolPayload({
        chainId,
        payload: await Payload.encode(items),
      });
      expect(result).toEqual({ valid: true, issues: [] });

      const treeResult = await tree.mempoolValidate({
        chainId,
        ratification: { type: "ecrecover", account, signature },
      });
      expect(treeResult).toEqual({ valid: true, issues: [] });
    },
    API_TIMEOUT,
  );

  test(
    "validates a Setter ratified offer",
    async () => {
      const tree = Tree.create({
        type: "setter",
        entries: [offer(setterRatifier)],
      });

      const items = SetterRatifier.ratify({ tree: tree.toDescriptor() });
      const result = await MidnightApi.validateMempoolPayload({
        chainId,
        payload: await Payload.encode(items),
      });
      expect(result).toEqual({ valid: true, issues: [] });

      const treeResult = await tree.mempoolValidate({
        chainId,
        ratification: { type: "setter" },
      });
      expect(treeResult).toEqual({ valid: true, issues: [] });
    },
    API_TIMEOUT,
  );

  test(
    "rejects a RateRatifierV1 offer whose ratifier is not registered",
    async () => {
      const tree = Tree.create({
        type: "rateV1",
        entries: [
          {
            offer: offer("0x00000000000000000000000000000000000000A1"),
            rate: 1_000_000_000n,
            allowedTaker: zeroAddress,
          },
        ],
      });

      const error = await tree
        .mempoolValidate({
          chainId,
          ratification: { type: "rateV1" },
        })
        .then(
          () => {
            throw new Error("Expected mempoolValidate to reject.");
          },
          (caught: unknown) => caught,
        );

      expect(error).toBeInstanceOf(MidnightMempoolValidationError);
      expect(error).toMatchObject({
        issues: [{ rule: MempoolPayloadValidationRule.Ratifier }],
      });
    },
    API_TIMEOUT,
  );

  test(
    "rejects a PriceRatifierV1 offer whose ratifier is not registered",
    async () => {
      const tree = Tree.create({
        type: "priceV1",
        entries: [
          {
            offer: offer("0x00000000000000000000000000000000000000A1"),
            allowedTaker: zeroAddress,
          },
        ],
      });

      const error = await tree
        .mempoolValidate({
          chainId,
          ratification: { type: "priceV1" },
        })
        .then(
          () => {
            throw new Error("Expected mempoolValidate to reject.");
          },
          (caught: unknown) => caught,
        );

      expect(error).toBeInstanceOf(MidnightMempoolValidationError);
      expect(error).toMatchObject({
        issues: [{ rule: MempoolPayloadValidationRule.Ratifier }],
      });
    },
    API_TIMEOUT,
  );

  test.skipIf(baseAddresses.rateRatifierV1 == null)(
    "validates a RateRatifierV1 ratified offer",
    async () => {
      const tree = Tree.create({
        type: "rateV1",
        entries: [
          {
            offer: offer(baseAddresses.rateRatifierV1!),
            rate: 1_000_000_000n,
            allowedTaker: zeroAddress,
          },
        ],
      });

      const result = await tree.mempoolValidate({
        chainId,
        ratification: { type: "rateV1" },
      });
      expect(result).toEqual({ valid: true, issues: [] });
    },
    API_TIMEOUT,
  );

  test.skipIf(baseAddresses.priceRatifierV1 == null)(
    "validates a PriceRatifierV1 ratified offer",
    async () => {
      const tree = Tree.create({
        type: "priceV1",
        entries: [
          {
            offer: offer(baseAddresses.priceRatifierV1!),
            allowedTaker: zeroAddress,
          },
        ],
      });

      const result = await tree.mempoolValidate({
        chainId,
        ratification: { type: "priceV1" },
      });
      expect(result).toEqual({ valid: true, issues: [] });
    },
    API_TIMEOUT,
  );
});
