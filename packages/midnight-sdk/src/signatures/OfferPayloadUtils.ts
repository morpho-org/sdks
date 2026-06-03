import { deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Address,
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  keccak256,
} from "viem";
import { setterRatifierAbi } from "../abis.js";
import { EIP712_DOMAIN_TYPEHASH, OFFER_TYPEHASH } from "../constants.js";
import {
  InvalidOfferPayloadError,
  InvalidOfferTreeHeightError,
} from "../errors.js";
import { MarketUtils } from "../market/index.js";
import { type IOffer, Offer, type OfferStruct } from "../offers/index.js";
import type { BigIntish, MidnightCall } from "../types.js";

const offerTreeTypeHashes = [
  "0x2b9ee710e1977dfc5778fe18c905ccc1d9e144baf3ba83be732d4da65ecb73e3",
  "0x3cc16189b92a85898f1d5c6e87282c8ded7c1c93b2323d5e85ae10c5f4b2b220",
  "0x6de37d3e570afa293a8107d4b6b1d9547616c04f42164d009c89194787b2ffa6",
  "0xba3ea2ddfbf40a906fcd1b9506dbd344c062e8dcba8b5c902ceb13339f45a358",
  "0xe5faa865e93bc1b7b8fdf91980f54682d649683b014edd6c54b642f5a0c96977",
  "0xeda50f61dd2a827c6ff9fbfcd54335628dcaa78aaa4f2d118c60886219cdce2b",
  "0x54e2c9cc40cdc0e9ad530cf2be298f952f57af2b18b02f88274a9bbab359d23a",
  "0xc9d81859d60d6b21c688f4be93ca83e3be222728bb156ef5f4cf497f879f1e29",
  "0xd59b0c4544e0c60c8611eab0aaa402575f14ee784d22289c5d57f48c422a62d6",
  "0xccad21701f34f08bb8398a3dbc77e20e4c9c424930f3a8b31485bf059e2bdb20",
  "0x8a42dfb49807647bfc49c906aef322aa0239d40e4cb675761e141bc7bfa530da",
  "0x2adc0d948b2e3ecb642661590d2eec36d4e71e9acf382deb6574371800caf198",
  "0xf5845dfaed016de272342f346346a49d4b1694f622144d420558a38e46ac9dad",
  "0x3d7df854e6294bf433b64bbb8d0a82fa875a87b45b0016db27fc5752e54126ad",
  "0x72a991a101708716ff427c524404ab44f4d4d1f4e7e76c0ae8b967222164b348",
  "0x762c88fc52cf78a54401d247790f1bdb619d51d3458d1415c20d1422197cecc4",
  "0x8ede2209e94c8d5f8379d733dc8712b71a3888c1c4b70f3d6b22285f70bf4286",
  "0x425b18f07b3ac2f641977d2c294590565dd40b5d8414610568dca64628399975",
  "0x7e7d98718c0180e882e5963b9bd49810096912c273dfa38d8afdd6d39fde86ec",
  "0x8d35d491a29d846489e19688efff3c4cc7dbd54458058d49b30294074539f0b9",
  "0x824e385eea1953bcbc783bf900b18aa6fba129b6908765e986cf0968b491ec4f",
] as const;

const offerHashParams = [
  { name: "typehash", type: "bytes32" },
  { name: "marketHash", type: "bytes32" },
  { name: "buy", type: "bool" },
  { name: "maker", type: "address" },
  { name: "start", type: "uint256" },
  { name: "expiry", type: "uint256" },
  { name: "tick", type: "uint256" },
  { name: "group", type: "bytes32" },
  { name: "callback", type: "address" },
  { name: "callbackDataHash", type: "bytes32" },
  { name: "receiverIfMakerIsSeller", type: "address" },
  { name: "ratifier", type: "address" },
  { name: "reduceOnly", type: "bool" },
  { name: "maxUnits", type: "uint256" },
  { name: "maxAssets", type: "uint256" },
] as const;

const signatureAbi = [
  {
    type: "tuple",
    components: [
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
  },
  { name: "root", type: "bytes32" },
  { name: "leafIndex", type: "uint256" },
  { name: "proof", type: "bytes32[]" },
] as const;

const setterRatifierDataAbi = [
  { name: "root", type: "bytes32" },
  { name: "leafIndex", type: "uint256" },
  { name: "proof", type: "bytes32[]" },
] as const;

const domainSeparatorAbi = [
  { name: "typehash", type: "bytes32" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

const treeStructHashAbi = [
  { name: "typehash", type: "bytes32" },
  { name: "root", type: "bytes32" },
] as const;

const isPowerOfTwo = (value: number) =>
  value > 0 && (value & (value - 1)) === 0;

const heightOf = (length: number) => {
  if (!isPowerOfTwo(length)) {
    throw new InvalidOfferPayloadError(
      `Offer payload size "${length}" must be a power of two.`,
    );
  }
  const height = Math.log2(length);
  if (height > 20) throw new InvalidOfferTreeHeightError(height);

  return height;
};

const toOfferStructs = (offers: readonly (IOffer | Offer)[]) => {
  if (offers.length === 0) {
    throw new InvalidOfferPayloadError("Offer payload must not be empty.");
  }

  heightOf(offers.length);
  return offers.map((offer) => Offer.from(offer).toStruct());
};

const buildTreeValue = (offers: readonly OfferStruct[]): unknown => {
  if (offers.length === 1) return offers[0]!;
  const mid = offers.length / 2;
  return [
    buildTreeValue(offers.slice(0, mid)),
    buildTreeValue(offers.slice(mid)),
  ];
};

const typedDataTypes = {
  EIP712Domain: [
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  CollateralParams: [
    { name: "token", type: "address" },
    { name: "lltv", type: "uint256" },
    { name: "maxLif", type: "uint256" },
    { name: "oracle", type: "address" },
  ],
  Market: [
    { name: "loanToken", type: "address" },
    { name: "collateralParams", type: "CollateralParams[]" },
    { name: "maturity", type: "uint256" },
    { name: "rcfThreshold", type: "uint256" },
    { name: "enterGate", type: "address" },
    { name: "liquidatorGate", type: "address" },
  ],
  Offer: [
    { name: "market", type: "Market" },
    { name: "buy", type: "bool" },
    { name: "maker", type: "address" },
    { name: "start", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "tick", type: "uint256" },
    { name: "group", type: "bytes32" },
    { name: "callback", type: "address" },
    { name: "callbackData", type: "bytes" },
    { name: "receiverIfMakerIsSeller", type: "address" },
    { name: "ratifier", type: "address" },
    { name: "reduceOnly", type: "bool" },
    { name: "maxUnits", type: "uint256" },
    { name: "maxAssets", type: "uint256" },
  ],
} as const;

/**
 * Signature tuple accepted by EcrecoverRatifier.
 *
 * @example
 * ```ts
 * import type { EcrecoverSignature } from "@morpho-org/midnight-sdk";
 *
 * const signature = {} as EcrecoverSignature;
 * console.log(signature.v);
 * ```
 */
export interface EcrecoverSignature {
  /** Recovery id. */
  readonly v: number;
  /** Signature `r` value. */
  readonly r: Hex;
  /** Signature `s` value. */
  readonly s: Hex;
}

/**
 * Offer tree payload descriptor.
 *
 * @example
 * ```ts
 * import type { OfferPayload } from "@morpho-org/midnight-sdk";
 *
 * const payload = {} as OfferPayload;
 * console.log(payload.root);
 * ```
 */
export interface OfferPayload {
  /** Offer structs in leaf order. */
  readonly offers: readonly OfferStruct[];
  /** Leaf hashes. */
  readonly leaves: readonly Hex[];
  /** Merkle root. */
  readonly root: Hex;
  /** Tree height. */
  readonly height: number;
}

/**
 * Merkle proof descriptor for one offer leaf.
 *
 * @example
 * ```ts
 * import type { OfferProof } from "@morpho-org/midnight-sdk";
 *
 * const proof = {} as OfferProof;
 * console.log(proof.leafIndex);
 * ```
 */
export interface OfferProof {
  /** Merkle root. */
  readonly root: Hex;
  /** Leaf index in the offer tree. */
  readonly leafIndex: bigint;
  /** Sibling hashes from leaf to root. */
  readonly proof: readonly Hex[];
}

/**
 * Ecrecover typed-data descriptor returned to signing code.
 *
 * @example
 * ```ts
 * import type { EcrecoverRatificationTypedData } from "@morpho-org/midnight-sdk";
 *
 * const typedData = {} as EcrecoverRatificationTypedData;
 * console.log(typedData.primaryType);
 * ```
 */
export interface EcrecoverRatificationTypedData {
  /** EIP-712 domain. */
  readonly domain: {
    readonly chainId: bigint;
    readonly verifyingContract: Address;
  };
  /** EIP-712 type map. */
  readonly types: typeof typedDataTypes & {
    readonly OfferTree: readonly [
      { readonly name: "offerTree"; readonly type: string },
    ];
  };
  /** Primary typed-data type. */
  readonly primaryType: "OfferTree";
  /** Typed-data message. */
  readonly message: {
    readonly offerTree: unknown;
  };
}

/**
 * Utilities for Midnight offer payloads, ratifier data, and root calls.
 *
 * @example
 * ```ts
 * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof OfferPayloadUtils.hashNode);
 * ```
 */
export namespace OfferPayloadUtils {
  /**
   * Returns the HashLib offer-tree typehash for a tree height.
   *
   * @param height - Tree height.
   * @returns OfferTree typehash.
   * @throws InvalidOfferTreeHeightError when height exceeds 20.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * console.log(OfferPayloadUtils.offerTreeTypeHash(0));
   * ```
   */
  export function offerTreeTypeHash(height: number) {
    const typehash = offerTreeTypeHashes[height];
    if (typehash == null) throw new InvalidOfferTreeHeightError(height);

    return typehash;
  }

  /**
   * Computes the HashLib offer struct hash.
   *
   * @param offer - Offer to hash.
   * @returns Offer hash.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const hash = OfferPayloadUtils.hashOffer({} as never);
   * console.log(hash);
   * ```
   */
  export function hashOffer(offer: IOffer | Offer) {
    const offerStruct = Offer.from(offer).toStruct();

    return keccak256(
      encodeAbiParameters(offerHashParams, [
        OFFER_TYPEHASH,
        MarketUtils.hashMarket(offerStruct.market),
        offerStruct.buy,
        offerStruct.maker,
        offerStruct.start,
        offerStruct.expiry,
        offerStruct.tick,
        offerStruct.group,
        offerStruct.callback,
        keccak256(offerStruct.callbackData),
        offerStruct.receiverIfMakerIsSeller,
        offerStruct.ratifier,
        offerStruct.reduceOnly,
        offerStruct.maxUnits,
        offerStruct.maxAssets,
      ]),
    );
  }

  /**
   * Computes HashLib node hash from left and right child hashes.
   *
   * @param left - Left child hash.
   * @param right - Right child hash.
   * @returns Node hash.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const root = OfferPayloadUtils.hashNode(
   *   "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   "0x0000000000000000000000000000000000000000000000000000000000000000",
   * );
   * console.log(root);
   * ```
   */
  export function hashNode(left: Hex, right: Hex) {
    return keccak256(concat([left as Hex, right as Hex]));
  }

  /**
   * Builds an offer payload and Merkle root.
   *
   * @param offers - Offers in leaf order.
   * @returns Offer payload descriptor.
   * @throws InvalidOfferPayloadError when the offer count is empty or not a power of two.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const payload = OfferPayloadUtils.buildOfferPayload([{} as never]);
   * console.log(payload.root);
   * ```
   */
  export function buildOfferPayload(
    offers: readonly (IOffer | Offer)[],
  ): OfferPayload {
    const offerStructs = toOfferStructs(offers);
    const height = heightOf(offerStructs.length);
    let level = offerStructs.map((offer) => hashOffer(offer));
    const leaves = [...level];

    while (level.length > 1) {
      const next: Hex[] = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(hashNode(level[i]!, level[i + 1]!));
      }
      level = next;
    }

    return deepFreeze({
      offers: offerStructs,
      leaves,
      root: level[0]!,
      height,
    });
  }

  /**
   * Builds only the offer-tree root.
   *
   * @param offers - Offers in leaf order.
   * @returns Merkle root.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const root = OfferPayloadUtils.buildOfferTreeRoot([{} as never]);
   * console.log(root);
   * ```
   */
  export function buildOfferTreeRoot(offers: readonly (IOffer | Offer)[]) {
    return buildOfferPayload(offers).root;
  }

  /**
   * Builds a Merkle proof for one offer.
   *
   * @param params - Proof parameters.
   * @returns Proof descriptor.
   * @throws InvalidOfferPayloadError when leaf index is out of range.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const proof = OfferPayloadUtils.buildOfferProof({ offers: [{} as never], leafIndex: 0n });
   * console.log(proof.proof.length);
   * ```
   */
  export function buildOfferProof(params: {
    readonly offers: readonly (IOffer | Offer)[];
    readonly leafIndex: BigIntish;
  }): OfferProof {
    const payload = buildOfferPayload(params.offers);
    const leafIndex = BigInt(params.leafIndex);
    if (leafIndex < 0n || leafIndex >= BigInt(payload.offers.length)) {
      throw new InvalidOfferPayloadError(
        `Leaf index "${leafIndex}" is outside the offer tree.`,
      );
    }

    let index = Number(leafIndex);
    let level = [...payload.leaves];
    const proof: Hex[] = [];
    while (level.length > 1) {
      proof.push(level[index ^ 1]!);
      const next: Hex[] = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(hashNode(level[i]!, level[i + 1]!));
      }
      index = Math.floor(index / 2);
      level = next;
    }

    return deepFreeze({ root: payload.root, leafIndex, proof });
  }

  /**
   * Builds EcrecoverRatifier typed data for a power-of-two offer tree.
   *
   * @param params - Typed-data parameters.
   * @returns EIP-712 typed-data descriptor.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const typedData = OfferPayloadUtils.buildEcrecoverRatificationTypedData({
   *   offers: [{} as never],
   *   chainId: 8453n,
   *   verifyingContract: "0x0000000000000000000000000000000000000001",
   * });
   * console.log(typedData.primaryType);
   * ```
   */
  export function buildEcrecoverRatificationTypedData(params: {
    readonly offers: readonly (IOffer | Offer)[];
    readonly chainId: BigIntish;
    readonly verifyingContract: Address | string;
  }): EcrecoverRatificationTypedData {
    const payload = buildOfferPayload(params.offers);
    const offerTreeType =
      payload.height === 0 ? "Offer" : `Offer${"[2]".repeat(payload.height)}`;

    return deepFreeze({
      domain: {
        chainId: BigInt(params.chainId),
        verifyingContract: params.verifyingContract as Address,
      },
      types: {
        ...typedDataTypes,
        OfferTree: [{ name: "offerTree", type: offerTreeType }],
      },
      primaryType: "OfferTree",
      message: {
        offerTree: buildTreeValue(payload.offers),
      },
    });
  }

  /**
   * Builds the EcrecoverRatifier digest used by the Solidity ratifier.
   *
   * @param params - Digest parameters.
   * @returns EIP-712 digest.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const digest = OfferPayloadUtils.buildEcrecoverRatificationDigest({
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   height: 0,
   *   chainId: 8453n,
   *   verifyingContract: "0x0000000000000000000000000000000000000001",
   * });
   * console.log(digest);
   * ```
   */
  export function buildEcrecoverRatificationDigest(params: {
    readonly root: Hex;
    readonly height: number;
    readonly chainId: BigIntish;
    readonly verifyingContract: Address | string;
  }) {
    const domainSeparator = keccak256(
      encodeAbiParameters(domainSeparatorAbi, [
        EIP712_DOMAIN_TYPEHASH,
        BigInt(params.chainId),
        params.verifyingContract as Address,
      ]),
    );
    const structHash = keccak256(
      encodeAbiParameters(treeStructHashAbi, [
        offerTreeTypeHash(params.height),
        params.root as Hex,
      ]),
    );

    return keccak256(concat(["0x1901", domainSeparator, structHash]));
  }

  /**
   * Signs EcrecoverRatifier typed data through an injected signing callback.
   *
   * @param params - Signing parameters.
   * @returns Signature returned by the callback.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const signature = await OfferPayloadUtils.signEcrecoverRatification({
   *   offers: [{} as never],
   *   chainId: 8453n,
   *   verifyingContract: "0x0000000000000000000000000000000000000001",
   *   signTypedData: () => "0x",
   * });
   * console.log(signature);
   * ```
   */
  export async function signEcrecoverRatification(params: {
    readonly offers: readonly (IOffer | Offer)[];
    readonly chainId: BigIntish;
    readonly verifyingContract: Address | string;
    readonly signTypedData: (
      typedData: EcrecoverRatificationTypedData,
    ) => Hex | Promise<Hex>;
  }) {
    return params.signTypedData(
      buildEcrecoverRatificationTypedData({
        offers: params.offers,
        chainId: params.chainId,
        verifyingContract: params.verifyingContract,
      }),
    );
  }

  /**
   * Encodes EcrecoverRatifier ratifier data.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded ratifier data.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const data = OfferPayloadUtils.encodeEcrecoverRatifierData({
   *   signature: {
   *     v: 27,
   *     r: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *     s: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   },
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   leafIndex: 0n,
   *   proof: [],
   * });
   * console.log(data);
   * ```
   */
  export function encodeEcrecoverRatifierData(params: {
    readonly signature: EcrecoverSignature;
    readonly root: Hex;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hex[];
  }) {
    return encodeAbiParameters(signatureAbi, [
      {
        v: params.signature.v,
        r: params.signature.r as Hex,
        s: params.signature.s as Hex,
      },
      params.root as Hex,
      BigInt(params.leafIndex),
      params.proof.map((node) => node as Hex),
    ]);
  }

  /**
   * Encodes SetterRatifier ratifier data.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded ratifier data.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const data = OfferPayloadUtils.encodeSetterRatifierData({
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   leafIndex: 0n,
   *   proof: [],
   * });
   * console.log(data);
   * ```
   */
  export function encodeSetterRatifierData(params: {
    readonly root: Hex;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hex[];
  }) {
    return encodeAbiParameters(setterRatifierDataAbi, [
      params.root as Hex,
      BigInt(params.leafIndex),
      params.proof.map((node) => node as Hex),
    ]);
  }

  /**
   * Builds a SetterRatifier root approval call.
   *
   * @param params - Approval parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const call = OfferPayloadUtils.buildSetterRootApprovalCall({
   *   setterRatifier: "0x0000000000000000000000000000000000000001",
   *   maker: "0x0000000000000000000000000000000000000002",
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   * });
   * console.log(call.data);
   * ```
   */
  export function buildSetterRootApprovalCall(params: {
    readonly setterRatifier: Address | string;
    readonly maker: Address | string;
    readonly root: Hex;
    readonly newIsRootRatified?: boolean;
  }): MidnightCall {
    const to = params.setterRatifier as Address;
    const root = params.root as Hex;
    return deepFreeze({
      to,
      data: encodeFunctionData({
        abi: setterRatifierAbi,
        functionName: "setIsRootRatified",
        args: [params.maker as Address, root, params.newIsRootRatified ?? true],
      }),
    });
  }

  /**
   * Builds a raw mempool submission call descriptor.
   *
   * @param params - Mempool submission parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { OfferPayloadUtils } from "@morpho-org/midnight-sdk";
   *
   * const call = OfferPayloadUtils.buildMempoolSubmissionCall({
   *   midnightMempool: "0x0000000000000000000000000000000000000001",
   *   payload: "0x",
   * });
   * console.log(call.to);
   * ```
   */
  export function buildMempoolSubmissionCall(params: {
    readonly midnightMempool: Address | string;
    readonly payload: Hex;
  }): MidnightCall {
    return deepFreeze({
      to: params.midnightMempool as Address,
      data: params.payload as Hex,
    });
  }
}
