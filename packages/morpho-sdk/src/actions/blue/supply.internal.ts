import { encodeFunctionData } from "viem";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  parseBlueMarket,
  parseNativeFunding,
  parseUint256Max,
} from "../../helpers/parse.js";
import type { BlueSupplyAction, Transaction } from "../../types/index.js";
import {
  NonPositiveInputError,
  UnexpectedRequirementSignatureError,
} from "../../types/index.js";
import { getBundlesReferralFeeAssets } from "../bundles/common.js";
import type { BlueOperationInput } from "./common.js";
import {
  finalizeBlueBundlesV1Transaction,
  getBlueBundlesV1TokenPermit,
  parseBlueBundlesV1Common,
} from "./common.js";
import type { BlueSupplyParams } from "./supply.js";

declare const blueSupplyBrand: unique symbol;
/** Validated supply inputs. @internal */
export interface BlueSupplyInput extends BlueOperationInput {
  readonly assets: bigint;
  readonly value: bigint;
  readonly [blueSupplyBrand]: true;
}

/** Parses the complete raw supply, including its optional funding signature. @internal */
export const parseBlueSupply = (params: BlueSupplyParams) => {
  const marketParams = parseBlueMarket(params.market.marketParams);
  const amount = params.args.assets;
  if (amount <= 0n) {
    throw new NonPositiveInputError("assets", amount);
  }
  const assets = parseUint256Max("assets", amount);
  const common = {
    chainId: params.market.chainId,
    userAddress: params.args.userAddress,
    deadline: params.args.deadline,
    referralFeePct: params.args.referralFeePct,
    referralFeeRecipient: params.args.referralFeeRecipient,
    metadata: params.metadata,
  };
  const normalized = parseBlueBundlesV1Common(common);
  const value = parseNativeFunding({
    chainId: common.chainId,
    token: marketParams.loanToken,
    fundedAmount: assets,
    nativeAmount: params.args.nativeAmount,
  });
  const parsed: Omit<BlueSupplyInput, symbol> = {
    ...normalized,
    chainId: common.chainId,
    userAddress: common.userAddress,
    marketParams,
    metadata: common.metadata,
    assets,
    value,
  };
  const input = parsed as BlueSupplyInput;
  return { ...input, tokenPermit: bindBlueSupplySignature(input, params.args) };
};

/** Encodes parsed inputs and independently validates supplied signatures. @internal */
export const buildBlueSupply = (
  parsed: BlueSupplyInput,
  signatures: Pick<BlueSupplyParams["args"], "requirementSignature"> = {},
): Readonly<Transaction<BlueSupplyAction>> => {
  return encodeBlueSupply({
    ...parsed,
    tokenPermit: bindBlueSupplySignature(parsed, signatures),
  });
};

const bindBlueSupplySignature = (
  parsed: BlueSupplyInput,
  signatures: Pick<BlueSupplyParams["args"], "requirementSignature">,
) => {
  const { chainId, marketParams, assets, userAddress, value } = parsed;
  const { requirementSignature } = signatures;
  if (value > 0n && requirementSignature != null) {
    throw new UnexpectedRequirementSignatureError(
      requirementSignature.action.type,
    );
  }
  return getBlueBundlesV1TokenPermit({
    chainId,
    userAddress,
    token: marketParams.loanToken,
    amount: assets,
    requirementSignature,
  });
};

/** Encodes a complete supply including its bound permit. @internal */
export const encodeBlueSupply = (
  parsed: BlueSupplyInput & {
    readonly tokenPermit: ReturnType<typeof getBlueBundlesV1TokenPermit>;
  },
): Readonly<Transaction<BlueSupplyAction>> => {
  const {
    deadline,
    marketParams,
    assets,
    userAddress,
    referralFeePct,
    referralFeeRecipient,
    value,
    tokenPermit,
  } = parsed;
  return finalizeBlueBundlesV1Transaction({
    common: parsed,
    value,
    data: encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1Supply",
      args: [
        marketParams,
        assets,
        tokenPermit,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      ],
    }),
    action: {
      type: "blueSupply",
      args: {
        market: marketParams.id,
        assets,
        onBehalf: userAddress,
        nativeAmount: value > 0n ? value : undefined,
        referralFeePct,
        referralFeeRecipient,
        referralFeeAssets: getBundlesReferralFeeAssets(assets, referralFeePct),
        deadline,
      },
    },
  });
};
