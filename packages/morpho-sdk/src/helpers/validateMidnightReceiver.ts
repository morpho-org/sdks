import type { MarketInput } from "@morpho-org/midnight-sdk";
import { type ChainAddresses, getChainAddresses } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, zeroAddress } from "viem";
import {
  MidnightContractReceiverError,
  MidnightZeroReceiverError,
  ReferralFeeRecipientMissingError,
} from "../types/index.js";
import { validateMidnightAddress } from "./validateMidnightAccount.js";

/** Registry keys of the Midnight protocol contracts that cannot forward received assets. */
const MIDNIGHT_CONTRACT_KEYS = [
  "midnight",
  "midnightBundlesV2",
  "midnightBlueBuyCallbackFactory",
  "midnightMempool",
  "ecrecoverRatifier",
  "ecrecoverAuthorizer",
  "setterRatifier",
  "priceRatifierV1",
  "rateRatifierV1",
] as const satisfies readonly (keyof ChainAddresses &
  MidnightContractReceiverError["contract"])[];

/**
 * Validates that a Midnight receiver field names an account that can forward received assets.
 *
 * `MidnightBundlesV2` has no sweep and Midnight core does not account self-transfers, so assets
 * sent to a Midnight protocol contract, or to the market's loan or collateral token contracts,
 * are lost permanently. The zero address burns them on tokens that accept it.
 *
 * @param params - Chain, market, and receiver field to check.
 * @param params.chainId - Chain id used to resolve the Midnight protocol addresses.
 * @param params.market - Midnight market whose token contracts are also rejected.
 * @param params.field - Receiver field being validated, reported on the thrown error.
 * @param params.receiver - Receiver address to check.
 * @throws {MidnightCalldataEncodingError} when the receiver or a market token address is malformed.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {MidnightZeroReceiverError} when `receiver` is the zero address and `field` is not
 *   `"referralFeeRecipient"`.
 * @throws {ReferralFeeRecipientMissingError} when `receiver` is the zero address and `field` is
 *   `"referralFeeRecipient"`.
 * @throws {MidnightContractReceiverError} when `receiver` is a Midnight protocol contract, the
 *   market's `midnight` contract, its `loanToken`, or one of its `collateralParams[i].token`.
 * @internal
 */
export const validateMidnightReceiver = (params: {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly field: "receiver" | "collateralReceiver" | "referralFeeRecipient";
  readonly receiver: Address;
}): void => {
  const { field, receiver } = params;
  const market =
    "params" in params.market ? params.market.params : params.market;

  // Validate addresses before comparing them so malformed values stay a typed SDK error.
  validateMidnightAddress(field, receiver);
  validateMidnightAddress("market.loanToken", market.loanToken);
  for (const [index, { token }] of market.collateralParams.entries()) {
    validateMidnightAddress(`market.collateralParams[${index}].token`, token);
  }

  if (isAddressEqual(receiver, zeroAddress)) {
    if (field === "referralFeeRecipient") {
      throw new ReferralFeeRecipientMissingError();
    }
    throw new MidnightZeroReceiverError(field);
  }

  const chainAddresses = getChainAddresses(params.chainId);
  if (isAddressEqual(receiver, market.midnight)) {
    throw new MidnightContractReceiverError({
      field,
      receiver,
      contract: "midnight",
    });
  }
  for (const key of MIDNIGHT_CONTRACT_KEYS) {
    const contract = chainAddresses[key];
    if (contract != null && isAddressEqual(receiver, contract)) {
      throw new MidnightContractReceiverError({
        field,
        receiver,
        contract: key,
      });
    }
  }

  if (isAddressEqual(receiver, market.loanToken)) {
    throw new MidnightContractReceiverError({
      field,
      receiver,
      contract: "loanToken",
    });
  }
  for (const [index, { token }] of market.collateralParams.entries()) {
    if (isAddressEqual(receiver, token)) {
      throw new MidnightContractReceiverError({
        field,
        receiver,
        contract: `collateralToken[${index}]`,
      });
    }
  }
};
