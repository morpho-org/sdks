import { MarketUtils, Payload } from "@morpho-org/midnight-sdk";
import { type Hex, isHex } from "viem";
import { InvalidMidnightHexInputError } from "../types/index.js";
import type { MidnightCancelAndMakeParams } from "../types/midnightCancelAndMake.js";

/** @internal */
export const snapshotMidnightCancelAndMakeParams = (
  params: MidnightCancelAndMakeParams,
): MidnightCancelAndMakeParams => {
  const {
    chainId,
    cancellations: inputCancellations,
    deadline,
    nativeAmount,
    metadata: inputMetadata,
    publication: inputPublication,
  } = params;
  const cancellations = inputCancellations.map(({ group, maxConsumed }) => ({
    group,
    maxConsumed,
  }));
  let metadata: MidnightCancelAndMakeParams["metadata"];
  if (inputMetadata != null) {
    const { origin, timestamp } = inputMetadata;
    metadata = { origin, ...(timestamp !== undefined && { timestamp }) };
  }

  let publication: MidnightCancelAndMakeParams["publication"];
  if (inputPublication != null) {
    const {
      ratifier,
      root,
      groups: inputGroups,
      payload,
      rootSignature: inputSignature,
      blueSupply: inputBlueSupply,
      collateral: inputCollateral,
    } = inputPublication;
    const groups = inputGroups.map((group) => group);
    const rootSignature =
      inputSignature == null
        ? undefined
        : {
            height: inputSignature.height,
            nonce: inputSignature.nonce,
            deadline: inputSignature.deadline,
            v: inputSignature.v,
            r: inputSignature.r,
            s: inputSignature.s,
          };
    let blueSupply: NonNullable<
      MidnightCancelAndMakeParams["publication"]
    >["blueSupply"];
    if (inputBlueSupply != null) {
      const { market: inputMarket, assets, callbackSalt } = inputBlueSupply;
      const { loanToken, collateralToken, oracle, irm, lltv } = inputMarket;
      blueSupply = {
        market: { loanToken, collateralToken, oracle, irm, lltv },
        assets,
        callbackSalt,
      };
    }
    let collateral: NonNullable<
      MidnightCancelAndMakeParams["publication"]
    >["collateral"];
    if (inputCollateral != null) {
      const { market: inputMarket, supplies: inputSupplies } = inputCollateral;
      const supplies = inputSupplies.map(({ collateralIndex, assets }) => ({
        collateralIndex,
        assets,
      }));
      collateral = { market: MarketUtils.toStruct(inputMarket), supplies };
    }
    publication = {
      ratifier,
      root,
      groups,
      payload,
      ...(rootSignature != null && { rootSignature }),
      ...(blueSupply != null && { blueSupply }),
      ...(collateral != null && { collateral }),
    };
  }

  return {
    chainId,
    cancellations,
    deadline,
    ...(nativeAmount !== undefined && { nativeAmount }),
    ...(metadata != null && { metadata }),
    ...(publication != null && { publication }),
  };
};

/**
 * @internal
 * Validates Midnight publication and cancellation hex inputs.
 *
 * @param params - Snapshotted cancellation and publication inputs.
 * @throws {InvalidMidnightHexInputError} when a root, publication group, cancellation group,
 *   callback salt, or root-signature `r`/`s` is not 32-byte hex, or payload is malformed or oversized.
 */
export const validateMidnightPublication = (
  params: MidnightCancelAndMakeParams,
): void => {
  for (const [index, cancellation] of params.cancellations.entries()) {
    validateHexInput(cancellation.group, `cancellations[${index}].group`, {
      exactBytes: 32,
    });
  }
  const publication = params.publication;
  if (publication == null) return;

  validateHexInput(publication.root, "publication.root", { exactBytes: 32 });
  for (const [index, group] of publication.groups.entries()) {
    validateHexInput(group, `publication.groups[${index}]`, {
      exactBytes: 32,
    });
  }
  if (publication.blueSupply != null) {
    validateHexInput(
      publication.blueSupply.callbackSalt,
      "publication.blueSupply.callbackSalt",
      { exactBytes: 32 },
    );
  }
  if (publication.rootSignature != null) {
    validateHexInput(
      publication.rootSignature.r,
      "publication.rootSignature.r",
      {
        exactBytes: 32,
      },
    );
    validateHexInput(
      publication.rootSignature.s,
      "publication.rootSignature.s",
      {
        exactBytes: 32,
      },
    );
  }
  if (publication.payload === "0x") return;
  validateHexInput(publication.payload, "publication.payload", {
    maxBytes: Payload.MAX_PAYLOAD_BYTES,
  });
};

// biome-ignore lint/complexity/useMaxParams: Keep value, field, and size explicit.
const validateHexInput = (
  value: Hex,
  field: string,
  size: { exactBytes: number } | { maxBytes: number },
): void => {
  if (!isHex(value)) {
    throw new InvalidMidnightHexInputError({
      field,
      value,
      reason: "notHex",
    });
  }
  if (value.length % 2 !== 0) {
    throw new InvalidMidnightHexInputError({
      field,
      value,
      reason: "oddLength",
    });
  }
  const byteLength = (value.length - 2) / 2;
  if ("exactBytes" in size && byteLength !== size.exactBytes) {
    throw new InvalidMidnightHexInputError({
      field,
      value,
      reason: "wrongSize",
    });
  }
  if ("maxBytes" in size && byteLength > size.maxBytes) {
    throw new InvalidMidnightHexInputError({
      field,
      value,
      reason: "tooLong",
    });
  }
};
