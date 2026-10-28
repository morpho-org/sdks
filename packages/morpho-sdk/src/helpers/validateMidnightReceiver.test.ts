import { Market } from "@morpho-org/midnight-sdk";
import { ChainId, getChainAddresses } from "@morpho-org/morpho-ts";
import {
  type Address,
  getAddress,
  InvalidAddressError,
  zeroAddress,
} from "viem";
import { describe, expect, it, test } from "vitest";
import {
  midnightAddresses,
  midnightMarket,
} from "../../test/fixtures/midnight.js";
import {
  MidnightCalldataEncodingError,
  MidnightContractReceiverError,
  MidnightZeroReceiverError,
  ReferralFeeRecipientMissingError,
} from "../types/index.js";
import { validateMidnightReceiver } from "./validateMidnightReceiver.js";

const chainId = ChainId.BaseMainnet;
const eoa = midnightAddresses.taker;

const validate = (receiver: Address, field = "receiver" as const) =>
  validateMidnightReceiver({
    chainId,
    market: midnightMarket,
    field,
    receiver,
  });

describe("validateMidnightReceiver", () => {
  test("error: a malformed receiver throws a typed encoding error", () => {
    const call = () => validate("0x123" as Address);

    expect(call).toThrow(MidnightCalldataEncodingError);
    expect(call).toThrow(
      expect.objectContaining({
        input: "receiver",
        cause: expect.any(InvalidAddressError),
      }),
    );
  });

  test("error: a malformed loan token throws a typed encoding error", () => {
    const call = () =>
      validateMidnightReceiver({
        chainId,
        market: { ...midnightMarket, loanToken: "0x123" as Address },
        field: "receiver",
        receiver: eoa,
      });

    expect(call).toThrow(MidnightCalldataEncodingError);
    expect(call).toThrow(
      expect.objectContaining({
        input: "market.loanToken",
        cause: expect.any(InvalidAddressError),
      }),
    );
  });

  test("error: a malformed collateral token throws a typed encoding error", () => {
    const call = () =>
      validateMidnightReceiver({
        chainId,
        market: {
          ...midnightMarket,
          collateralParams: [
            {
              ...midnightMarket.collateralParams[0]!,
              token: "0x123" as Address,
            },
          ],
        },
        field: "receiver",
        receiver: eoa,
      });

    expect(call).toThrow(MidnightCalldataEncodingError);
    expect(call).toThrow(
      expect.objectContaining({
        input: "market.collateralParams[0].token",
        cause: expect.any(InvalidAddressError),
      }),
    );
  });

  test("error: MidnightZeroReceiverError for a zero receiver", () => {
    const call = () => validate(zeroAddress);

    expect(call).toThrow(MidnightZeroReceiverError);
    expect(call).toThrow(expect.objectContaining({ field: "receiver" }));
  });

  test("error: MidnightZeroReceiverError for a zero collateralReceiver", () => {
    const call = () =>
      validateMidnightReceiver({
        chainId,
        market: midnightMarket,
        field: "collateralReceiver",
        receiver: zeroAddress,
      });

    expect(call).toThrow(MidnightZeroReceiverError);
    expect(call).toThrow(
      expect.objectContaining({ field: "collateralReceiver" }),
    );
  });

  test("error: ReferralFeeRecipientMissingError for a zero referralFeeRecipient", () => {
    const call = () =>
      validateMidnightReceiver({
        chainId,
        market: midnightMarket,
        field: "referralFeeRecipient",
        receiver: zeroAddress,
      });

    expect(call).toThrow(ReferralFeeRecipientMissingError);
    expect(call).not.toThrow(MidnightZeroReceiverError);
  });

  const baseAddresses = getChainAddresses(chainId);
  const registryCases = [
    "midnight",
    "midnightBundlesV2",
    "midnightBlueBuyCallbackFactory",
    "midnightMempool",
    "ecrecoverRatifier",
    "ecrecoverAuthorizer",
    "setterRatifier",
    "priceRatifierV1",
    "rateRatifierV1",
  ] as const;

  it.each(registryCases)(
    "error: MidnightContractReceiverError for the %s contract",
    (key) => {
      const contract = baseAddresses[key];
      expect(contract).toBeDefined();
      const call = () => validate(contract as Address);

      expect(call).toThrow(MidnightContractReceiverError);
      expect(call).toThrow(
        expect.objectContaining({
          field: "receiver",
          receiver: contract,
          contract: key,
        }),
      );
    },
  );

  test("error: MidnightContractReceiverError for a non-checksummed contract address", () => {
    const contract = baseAddresses.midnightBundlesV2;
    expect(contract).toBeDefined();
    const call = () => validate(contract!.toLowerCase() as Address);

    expect(call).toThrow(MidnightContractReceiverError);
    expect(call).toThrow(
      expect.objectContaining({ contract: "midnightBundlesV2" }),
    );
  });

  test("error: MidnightContractReceiverError for the market loanToken", () => {
    const call = () => validate(midnightMarket.loanToken);

    expect(call).toThrow(MidnightContractReceiverError);
    expect(call).toThrow(expect.objectContaining({ contract: "loanToken" }));
  });

  test("error: MidnightContractReceiverError for a market collateral token", () => {
    const call = () => validate(midnightMarket.collateralParams[0]!.token);

    expect(call).toThrow(MidnightContractReceiverError);
    expect(call).toThrow(
      expect.objectContaining({ contract: "collateralToken[0]" }),
    );
  });

  test("behavior: a hydrated Market input takes the params branch", () => {
    const market = new Market({
      params: midnightMarket,
      totalUnits: 1_000_000n,
      lossFactor: 0n,
      withdrawable: 1_000_000n,
      continuousFeeCredit: 0n,
      settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
      continuousFee: 0,
      tickSpacing: 1,
    });
    const hydrated = (receiver: Address) =>
      validateMidnightReceiver({
        chainId,
        market,
        field: "receiver",
        receiver,
      });

    const loanCall = () => hydrated(midnightMarket.loanToken);
    expect(loanCall).toThrow(MidnightContractReceiverError);
    expect(loanCall).toThrow(
      expect.objectContaining({ contract: "loanToken" }),
    );

    const collateralCall = () =>
      hydrated(midnightMarket.collateralParams[0]!.token);
    expect(collateralCall).toThrow(MidnightContractReceiverError);
    expect(collateralCall).toThrow(
      expect.objectContaining({ contract: "collateralToken[0]" }),
    );

    expect(() => hydrated(eoa)).not.toThrow();
  });

  test("behavior: an ordinary account passes", () => {
    expect(() => validate(eoa)).not.toThrow();
    expect(() =>
      validateMidnightReceiver({
        chainId,
        market: midnightMarket,
        field: "referralFeeRecipient",
        receiver: eoa,
      }),
    ).not.toThrow();
  });

  test("behavior: a chain missing some Midnight registry keys accepts an EOA", () => {
    const sparseAddresses = getChainAddresses(ChainId.TempoMainnet);
    expect(sparseAddresses.ecrecoverRatifier).toBeUndefined();
    expect(sparseAddresses.setterRatifier).toBeUndefined();

    expect(() =>
      validateMidnightReceiver({
        chainId: ChainId.TempoMainnet,
        market: midnightMarket,
        field: "receiver",
        receiver: eoa,
      }),
    ).not.toThrow();
    expect(() =>
      validateMidnightReceiver({
        chainId: ChainId.TempoMainnet,
        market: midnightMarket,
        field: "receiver",
        receiver: getAddress(sparseAddresses.midnightBundlesV2!),
      }),
    ).toThrow(MidnightContractReceiverError);
  });
});
