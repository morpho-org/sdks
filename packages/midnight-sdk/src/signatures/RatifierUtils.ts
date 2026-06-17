import { type BigIntish, deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Address,
  concat,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  type Hash,
  type Hex,
  keccak256,
  parseSignature,
} from "viem";
import { ecrecoverRatifierAbi, setterRatifierAbi } from "../abis.js";
import { EIP712_DOMAIN_TYPEHASH } from "../constants.js";
import {
  InvalidOfferTreeError,
  InvalidOfferTreeHeightError,
} from "../errors.js";
import type { Offer, OfferStruct } from "../offers/index.js";
import type { Group, OfferTreeProof, TreeInput } from "./OfferTreeUtils.js";
import { OfferTreeUtils } from "./OfferTreeUtils.js";
import type { Item as PayloadItem } from "./Payload.js";

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

const buildTreeValue = (offers: readonly OfferStruct[]): unknown => {
  if (offers.length === 1) return offers[0]!;
  const mid = offers.length / 2;
  return [
    buildTreeValue(offers.slice(0, mid)),
    buildTreeValue(offers.slice(mid)),
  ];
};

function findOfferGroupId(params: {
  readonly groups: readonly Group[];
  readonly offer: Offer;
  readonly leafIndex: number;
}): Hash {
  let leafIndex = 0;
  for (const group of params.groups) {
    for (const offer of group.offers) {
      if (leafIndex === params.leafIndex && offer === params.offer) {
        return group.id;
      }
      leafIndex += 1;
    }
  }

  throw new InvalidOfferTreeError(
    `Leaf index "${params.leafIndex}" is outside the offer tree.`,
  );
}

/**
 * Parameters for {@link RatifierUtils.getRatifierInfo}.
 *
 * @example
 * ```ts
 * import type { GetRatifierInfoParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as GetRatifierInfoParams;
 * console.log(params.bytecode);
 * ```
 */
export interface GetRatifierInfoParams {
  /** Maker account bytecode returned by viem `getBytecode`. */
  readonly bytecode?: Hex | null;
  /** Ecrecover ratifier address. */
  readonly ecrecoverRatifier: Address;
  /** Setter ratifier address. */
  readonly setterRatifier: Address;
}

/**
 * Classification of the ratifier route for a maker account.
 *
 * @example
 * ```ts
 * import type { RatifierInfo } from "@morpho-org/midnight-sdk";
 *
 * const info: RatifierInfo = {
 *   type: "ecrecover",
 *   ratifier: "0x0000000000000000000000000000000000000001",
 * };
 * ```
 */
export interface RatifierInfo {
  /** Ratifier family selected for the maker account. */
  readonly type: "ecrecover" | "setter";
  /** Ratifier contract address to put on the offer. */
  readonly ratifier: Address;
}

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
 * Decoded EcrecoverRatifier ratifier data.
 *
 * @example
 * ```ts
 * import type { DecodedEcrecoverRatifierData } from "@morpho-org/midnight-sdk";
 *
 * const decoded = {} as DecodedEcrecoverRatifierData;
 * console.log(decoded.signature.v);
 * ```
 */
export interface DecodedEcrecoverRatifierData extends OfferTreeProof {
  /** Ecrecover signature tuple. */
  readonly signature: EcrecoverSignature;
}

/**
 * Decoded SetterRatifier ratifier data.
 *
 * @example
 * ```ts
 * import type { DecodedSetterRatifierData } from "@morpho-org/midnight-sdk";
 *
 * const decoded = {} as DecodedSetterRatifierData;
 * console.log(decoded.root);
 * ```
 */
export type DecodedSetterRatifierData = OfferTreeProof;

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
 * Hex string or tuple signature accepted by Ecrecover ratifier helpers.
 *
 * @example
 * ```ts
 * import type { EcrecoverSignatureInput } from "@morpho-org/midnight-sdk";
 *
 * const signature = "0x" as EcrecoverSignatureInput;
 * console.log(signature);
 * ```
 */
export type EcrecoverSignatureInput = Hex | EcrecoverSignature;

/**
 * Signing callback accepted by Ecrecover ratifier helpers.
 *
 * @example
 * ```ts
 * import type { EcrecoverSignTypedData } from "@morpho-org/midnight-sdk";
 *
 * const signTypedData: EcrecoverSignTypedData = () => "0x";
 * console.log(signTypedData);
 * ```
 */
export type EcrecoverSignTypedData = (
  typedData: EcrecoverRatificationTypedData,
) => Hex | Promise<Hex>;

/**
 * Parameters for {@link EcrecoverRatifierUtils.typedData}.
 *
 * @example
 * ```ts
 * import type { EcrecoverRatifierTypedDataParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as EcrecoverRatifierTypedDataParams;
 * console.log(params.chainId);
 * ```
 */
export interface EcrecoverRatifierTypedDataParams {
  /** Offer tree being ratified. */
  readonly tree: TreeInput;
  /** Chain id used by the EIP-712 domain. */
  readonly chainId: BigIntish;
  /** EcrecoverRatifier contract address used by the EIP-712 domain. */
  readonly verifyingContract: Address;
}

/**
 * Parameters for {@link EcrecoverRatifierUtils.ratify}.
 *
 * @example
 * ```ts
 * import type { EcrecoverRatifierRatifyParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as EcrecoverRatifierRatifyParams;
 * console.log(params.tree);
 * ```
 */
export type EcrecoverRatifierRatifyParams =
  | (EcrecoverRatifierTypedDataParams & {
      /** Callback that signs the typed data built from `tree`. */
      readonly signTypedData: EcrecoverSignTypedData;
      /** Omit when the SDK should request the signature through `signTypedData`. */
      readonly signature?: undefined;
    })
  | {
      /** Offer tree being ratified. */
      readonly tree: TreeInput;
      /** Precomputed signature for this tree root. */
      readonly signature: EcrecoverSignatureInput;
      /** Omit when a precomputed signature is supplied. */
      readonly signTypedData?: undefined;
      /** Omit when a precomputed signature is supplied. */
      readonly chainId?: undefined;
      /** Omit when a precomputed signature is supplied. */
      readonly verifyingContract?: undefined;
    };

/**
 * Parameters for one EcrecoverRatifier ratifier-data value.
 *
 * @example
 * ```ts
 * import type { EcrecoverRatifierDataParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as EcrecoverRatifierDataParams;
 * console.log(params.leafIndex);
 * ```
 */
export interface EcrecoverRatifierDataParams {
  /** Offer tree that produced the proof. */
  readonly tree: TreeInput;
  /** Leaf index to prove. */
  readonly leafIndex: BigIntish;
  /** Ecrecover signature for the tree root. */
  readonly signature: EcrecoverSignatureInput;
}

/**
 * Parameters for one SetterRatifier ratifier-data value.
 *
 * @example
 * ```ts
 * import type { SetterRatifierDataParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as SetterRatifierDataParams;
 * console.log(params.leafIndex);
 * ```
 */
export interface SetterRatifierDataParams {
  /** Offer tree that produced the proof. */
  readonly tree: TreeInput;
  /** Leaf index to prove. */
  readonly leafIndex: BigIntish;
}

/**
 * Utilities for selecting Midnight ratifier routes.
 *
 * @example
 * ```ts
 * import { RatifierUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(RatifierUtils.isEip7702Designator("0xef0100"));
 * ```
 */
export namespace RatifierUtils {
  /**
   * Checks whether bytecode is an EIP-7702 designator.
   *
   * @param bytecode - Account bytecode.
   * @returns Whether the bytecode starts with `0xef0100`.
   * @example
   * ```ts
   * import { RatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * console.log(RatifierUtils.isEip7702Designator("0xef0100"));
   * ```
   */
  export function isEip7702Designator(bytecode: Hex) {
    return bytecode.toLowerCase().startsWith("0xef0100");
  }

  /**
   * Selects Ecrecover for EOAs/EIP-7702 accounts and Setter for deployed-code accounts.
   *
   * @param params - Ratifier selection parameters.
   * @returns Ratifier information for the maker.
   * @example
   * ```ts
   * import { RatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const info = RatifierUtils.getRatifierInfo({
   *   bytecode: "0x",
   *   ecrecoverRatifier: "0x0000000000000000000000000000000000000001",
   *   setterRatifier: "0x0000000000000000000000000000000000000002",
   * });
   * console.log(info.type);
   * ```
   */
  export function getRatifierInfo(params: GetRatifierInfoParams): RatifierInfo {
    const ecrecoverRatifier = params.ecrecoverRatifier;
    const setterRatifier = params.setterRatifier;
    const bytecode = params.bytecode;
    if (
      bytecode == null ||
      bytecode === "0x" ||
      isEip7702Designator(bytecode)
    ) {
      return { type: "ecrecover", ratifier: ecrecoverRatifier };
    }

    return { type: "setter", ratifier: setterRatifier };
  }
}

/**
 * EcrecoverRatifier-specific pure utilities.
 *
 * @example
 * ```ts
 * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(EcrecoverRatifierUtils.offerTreeTypeHash(0));
 * ```
 */
export namespace EcrecoverRatifierUtils {
  /**
   * Returns the Solidity HashLib offer-tree typehash for a tree height.
   *
   * @param height - Tree height.
   * @returns OfferTree typehash.
   * @throws InvalidOfferTreeHeightError when height exceeds 20.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * console.log(EcrecoverRatifierUtils.offerTreeTypeHash(0));
   * ```
   */
  export function offerTreeTypeHash(height: number) {
    const typehash = offerTreeTypeHashes[height];
    if (typehash == null) throw new InvalidOfferTreeHeightError(height);

    return typehash;
  }

  /**
   * Builds EcrecoverRatifier typed data for an offer tree.
   *
   * @param params - Typed-data parameters.
   * @returns EIP-712 typed-data descriptor.
   * @throws InvalidOfferTreeError when the tree is invalid.
   * @throws InvalidOfferTreeHeightError when the tree height is unsupported.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const typedData = EcrecoverRatifierUtils.typedData({
   *   tree: [{} as never],
   *   chainId: 8453n,
   *   verifyingContract: "0x0000000000000000000000000000000000000001",
   * });
   * console.log(typedData.primaryType);
   * ```
   */
  export function typedData(
    params: EcrecoverRatifierTypedDataParams,
  ): EcrecoverRatificationTypedData {
    const tree = OfferTreeUtils.normalizeTree(params.tree);
    const payload = OfferTreeUtils.buildOfferTreeDescriptor(tree.groups);
    const offerTreeType =
      payload.height === 0 ? "Offer" : `Offer${"[2]".repeat(payload.height)}`;

    return deepFreeze({
      domain: {
        chainId: BigInt(params.chainId),
        verifyingContract: params.verifyingContract,
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
   * @throws InvalidOfferTreeHeightError when height exceeds 20.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const digest = EcrecoverRatifierUtils.digest({
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   height: 0,
   *   chainId: 8453n,
   *   verifyingContract: "0x0000000000000000000000000000000000000001",
   * });
   * console.log(digest);
   * ```
   */
  export function digest(params: {
    readonly root: Hash;
    readonly height: number;
    readonly chainId: BigIntish;
    readonly verifyingContract: Address;
  }) {
    const domainSeparator = keccak256(
      encodeAbiParameters(domainSeparatorAbi, [
        EIP712_DOMAIN_TYPEHASH,
        BigInt(params.chainId),
        params.verifyingContract,
      ]),
    );
    const structHash = keccak256(
      encodeAbiParameters(treeStructHashAbi, [
        offerTreeTypeHash(params.height),
        params.root,
      ]),
    );

    return keccak256(concat(["0x1901", domainSeparator, structHash]));
  }

  /**
   * Signs EcrecoverRatifier typed data through an injected signing callback.
   *
   * @param params - Signing parameters.
   * @returns Signature returned by the callback.
   * @throws InvalidOfferTreeError when the tree is invalid.
   * @throws InvalidOfferTreeHeightError when the tree height is unsupported.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const signature = await EcrecoverRatifierUtils.sign({
   *   tree: [{} as never],
   *   chainId: 8453n,
   *   verifyingContract: "0x0000000000000000000000000000000000000001",
   *   signTypedData: () => "0x",
   * });
   * console.log(signature);
   * ```
   */
  export async function sign(
    params: EcrecoverRatifierTypedDataParams & {
      readonly signTypedData: EcrecoverSignTypedData;
    },
  ) {
    return params.signTypedData(typedData(params));
  }

  /**
   * Normalizes a hex ECDSA signature into the Solidity tuple shape.
   *
   * @param signature - Hex string or tuple signature.
   * @returns Signature tuple.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const signature = EcrecoverRatifierUtils.normalizeSignature("0x" as never);
   * console.log(signature.v);
   * ```
   */
  export function normalizeSignature(
    signature: EcrecoverSignatureInput,
  ): EcrecoverSignature {
    if (typeof signature !== "string") return signature;

    const parsed = parseSignature(signature);
    return {
      v: Number(parsed.v ?? BigInt(parsed.yParity + 27)),
      r: parsed.r,
      s: parsed.s,
    };
  }

  /**
   * Encodes EcrecoverRatifier ratifier data.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded ratifier data.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const data = EcrecoverRatifierUtils.encodeRatifierData({
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
  export function encodeRatifierData(params: {
    readonly signature: EcrecoverSignature;
    readonly root: Hash;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hash[];
  }) {
    return encodeAbiParameters(signatureAbi, [
      {
        v: params.signature.v,
        r: params.signature.r,
        s: params.signature.s,
      },
      params.root,
      BigInt(params.leafIndex),
      params.proof,
    ]);
  }

  /**
   * Decodes EcrecoverRatifier ratifier data.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded Ecrecover ratifier data.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const decoded = EcrecoverRatifierUtils.decodeRatifierData("0x" as never);
   * console.log(decoded.leafIndex);
   * ```
   */
  export function decodeRatifierData(data: Hex): DecodedEcrecoverRatifierData {
    const [signature, root, leafIndex, proof] = decodeAbiParameters(
      signatureAbi,
      data,
    );

    return deepFreeze({
      signature: {
        v: signature.v,
        r: signature.r,
        s: signature.s,
      },
      root,
      leafIndex,
      proof: [...proof],
    });
  }

  /**
   * Builds one ratifier-data value for a tree leaf.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded EcrecoverRatifier data.
   * @throws InvalidOfferTreeError when the leaf index is outside the tree.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const data = EcrecoverRatifierUtils.ratifierData({} as never);
   * console.log(data);
   * ```
   */
  export function ratifierData(params: EcrecoverRatifierDataParams): Hex {
    const tree = OfferTreeUtils.normalizeTree(params.tree);
    const proof = tree.proof(params.leafIndex);

    return encodeRatifierData({
      signature: normalizeSignature(params.signature),
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
    });
  }

  /**
   * Signs or consumes a tree signature and returns payload-ready items.
   *
   * @param params - Ratification parameters.
   * @returns Items containing each offer and its ratifier data.
   * @throws InvalidOfferTreeError when the tree is invalid.
   * @throws InvalidOfferTreeHeightError when the tree height is unsupported.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const items = await EcrecoverRatifierUtils.ratify({
   *   tree: [{} as never],
   *   signature: {
   *     v: 27,
   *     r: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *     s: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   },
   * });
   * console.log(items.length);
   * ```
   */
  export async function ratify(
    params: EcrecoverRatifierRatifyParams,
  ): Promise<readonly PayloadItem[]> {
    const tree = OfferTreeUtils.normalizeTree(params.tree);
    const signature =
      params.signature != null
        ? normalizeSignature(params.signature)
        : normalizeSignature(
            await params.signTypedData(
              typedData({
                tree,
                chainId: params.chainId,
                verifyingContract: params.verifyingContract,
              }),
            ),
          );

    return tree.offers.map((offer, leafIndex) => ({
      offer,
      group: findOfferGroupId({ groups: tree.groups, offer, leafIndex }),
      ratifierData: ratifierData({ tree, leafIndex, signature }),
    }));
  }

  /**
   * Builds an EcrecoverRatifier root-cancellation call.
   *
   * @param params - Cancellation parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const call = EcrecoverRatifierUtils.buildRootCancellationCall({
   *   ecrecoverRatifier: "0x0000000000000000000000000000000000000001",
   *   maker: "0x0000000000000000000000000000000000000002",
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   * });
   * console.log(call.to);
   * ```
   */
  export function buildRootCancellationCall(params: {
    readonly ecrecoverRatifier: Address;
    readonly maker: Address;
    readonly root: Hash;
  }): { readonly to: Address; readonly data: Hex } {
    return deepFreeze({
      to: params.ecrecoverRatifier,
      data: encodeFunctionData({
        abi: ecrecoverRatifierAbi,
        functionName: "cancelRoot",
        args: [params.maker, params.root],
      }),
    });
  }
}

/**
 * SetterRatifier-specific pure utilities.
 *
 * @example
 * ```ts
 * import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof SetterRatifierUtils.encodeRatifierData);
 * ```
 */
export namespace SetterRatifierUtils {
  /**
   * Encodes SetterRatifier ratifier data.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded ratifier data.
   * @example
   * ```ts
   * import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const data = SetterRatifierUtils.encodeRatifierData({
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   leafIndex: 0n,
   *   proof: [],
   * });
   * console.log(data);
   * ```
   */
  export function encodeRatifierData(params: {
    readonly root: Hash;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hash[];
  }) {
    return encodeAbiParameters(setterRatifierDataAbi, [
      params.root,
      BigInt(params.leafIndex),
      params.proof,
    ]);
  }

  /**
   * Decodes SetterRatifier ratifier data.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded Setter ratifier data.
   * @example
   * ```ts
   * import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const decoded = SetterRatifierUtils.decodeRatifierData("0x" as never);
   * console.log(decoded.proof);
   * ```
   */
  export function decodeRatifierData(data: Hex): DecodedSetterRatifierData {
    const [root, leafIndex, proof] = decodeAbiParameters(
      setterRatifierDataAbi,
      data,
    );

    return deepFreeze({ root, leafIndex, proof: [...proof] });
  }

  /**
   * Builds one ratifier-data value for a tree leaf.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded SetterRatifier data.
   * @throws InvalidOfferTreeError when the leaf index is outside the tree.
   * @example
   * ```ts
   * import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const data = SetterRatifierUtils.ratifierData({} as never);
   * console.log(data);
   * ```
   */
  export function ratifierData(params: SetterRatifierDataParams): Hex {
    const tree = OfferTreeUtils.normalizeTree(params.tree);
    const proof = tree.proof(params.leafIndex);

    return encodeRatifierData({
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
    });
  }

  /**
   * Returns payload-ready items after a Setter root has been approved.
   *
   * @param params - Tree to ratify.
   * @returns Items containing each offer and its ratifier data.
   * @throws InvalidOfferTreeError when the tree is invalid.
   * @example
   * ```ts
   * import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const items = SetterRatifierUtils.ratify({ tree: [{} as never] });
   * console.log(items.length);
   * ```
   */
  export function ratify(params: {
    readonly tree: TreeInput;
  }): readonly PayloadItem[] {
    const tree = OfferTreeUtils.normalizeTree(params.tree);

    return tree.offers.map((offer, leafIndex) => ({
      offer,
      group: findOfferGroupId({ groups: tree.groups, offer, leafIndex }),
      ratifierData: ratifierData({ tree, leafIndex }),
    }));
  }

  /**
   * Builds a SetterRatifier root-approval call.
   *
   * @param params - Approval parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const call = SetterRatifierUtils.buildRootApprovalCall({
   *   setterRatifier: "0x0000000000000000000000000000000000000001",
   *   maker: "0x0000000000000000000000000000000000000002",
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   * });
   * console.log(call.data);
   * ```
   */
  export function buildRootApprovalCall(params: {
    readonly setterRatifier: Address;
    readonly maker: Address;
    readonly root: Hash;
    readonly newIsRootRatified?: boolean;
  }): { readonly to: Address; readonly data: Hex } {
    const to = params.setterRatifier;
    const root = params.root;
    return deepFreeze({
      to,
      data: encodeFunctionData({
        abi: setterRatifierAbi,
        functionName: "setIsRootRatified",
        args: [params.maker, root, params.newIsRootRatified ?? true],
      }),
    });
  }
}

/**
 * EcrecoverRatifier class API backed by {@link EcrecoverRatifierUtils}.
 *
 * @example
 * ```ts
 * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
 *
 * const items = await EcrecoverRatifier.ratify({
 *   tree: [{} as never],
 *   signature: {
 *     v: 27,
 *     r: "0x0000000000000000000000000000000000000000000000000000000000000000",
 *     s: "0x0000000000000000000000000000000000000000000000000000000000000000",
 *   },
 * });
 * console.log(items.length);
 * ```
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Provides a behavior-bearing class API.
export class EcrecoverRatifier {
  /**
   * Builds the EIP-712 typed data for a tree.
   *
   * @param params - Typed-data parameters.
   * @returns EIP-712 typed-data descriptor.
   * @throws InvalidOfferTreeError when the tree is invalid.
   * @throws InvalidOfferTreeHeightError when the tree height is unsupported.
   * @example
   * ```ts
   * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
   *
   * const typedData = EcrecoverRatifier.typedData({
   *   tree: [{} as never],
   *   chainId: 8453n,
   *   verifyingContract: "0x0000000000000000000000000000000000000001",
   * });
   * console.log(typedData.primaryType);
   * ```
   */
  public static typedData(
    params: EcrecoverRatifierTypedDataParams,
  ): EcrecoverRatificationTypedData {
    return EcrecoverRatifierUtils.typedData(params);
  }

  /**
   * Builds one ratifier-data value for a tree leaf.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded EcrecoverRatifier data.
   * @throws InvalidOfferTreeError when the leaf index is outside the tree.
   * @example
   * ```ts
   * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
   *
   * const data = EcrecoverRatifier.ratifierData({} as never);
   * console.log(data);
   * ```
   */
  public static ratifierData(params: EcrecoverRatifierDataParams): Hex {
    return EcrecoverRatifierUtils.ratifierData(params);
  }

  /**
   * Signs or consumes a tree signature and returns payload-ready items.
   *
   * The returned items are independent of the mempool wire codec. Call
   * `Payload.encode(items)` only at the publication edge.
   *
   * @param params - Ratification parameters.
   * @returns Items containing each offer and its ratifier data.
   * @throws InvalidOfferTreeError when the tree is invalid.
   * @throws InvalidOfferTreeHeightError when the tree height is unsupported.
   * @example
   * ```ts
   * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
   *
   * const items = await EcrecoverRatifier.ratify({
   *   tree: [{} as never],
   *   signature: {
   *     v: 27,
   *     r: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *     s: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   },
   * });
   * console.log(items[0]?.ratifierData);
   * ```
   */
  public static async ratify(
    params: EcrecoverRatifierRatifyParams,
  ): Promise<readonly PayloadItem[]> {
    return EcrecoverRatifierUtils.ratify(params);
  }

  /**
   * Decodes EcrecoverRatifier data.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded ratifier data.
   * @example
   * ```ts
   * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
   *
   * const decoded = EcrecoverRatifier.decodeRatifierData("0x" as never);
   * console.log(decoded.root);
   * ```
   */
  public static decodeRatifierData(data: Hex): DecodedEcrecoverRatifierData {
    return EcrecoverRatifierUtils.decodeRatifierData(data);
  }

  /**
   * Builds an EcrecoverRatifier root-cancellation call.
   *
   * @param params - Cancellation parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
   *
   * const call = EcrecoverRatifier.cancelRoot({} as never);
   * console.log(call.to);
   * ```
   */
  public static cancelRoot(params: {
    readonly ecrecoverRatifier: Address;
    readonly maker: Address;
    readonly root: Hash;
  }): { readonly to: Address; readonly data: Hex } {
    return EcrecoverRatifierUtils.buildRootCancellationCall(params);
  }
}

/**
 * SetterRatifier class API backed by {@link SetterRatifierUtils}.
 *
 * @example
 * ```ts
 * import { SetterRatifier } from "@morpho-org/midnight-sdk";
 *
 * const items = SetterRatifier.ratify({ tree: [{} as never] });
 * console.log(items.length);
 * ```
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Provides a behavior-bearing class API.
export class SetterRatifier {
  /**
   * Builds one ratifier-data value for a tree leaf.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded SetterRatifier data.
   * @throws InvalidOfferTreeError when the leaf index is outside the tree.
   * @example
   * ```ts
   * import { SetterRatifier } from "@morpho-org/midnight-sdk";
   *
   * const data = SetterRatifier.ratifierData({} as never);
   * console.log(data);
   * ```
   */
  public static ratifierData(params: SetterRatifierDataParams): Hex {
    return SetterRatifierUtils.ratifierData(params);
  }

  /**
   * Returns payload-ready items after a Setter root has been approved.
   *
   * The returned items are independent of the mempool wire codec. Call
   * `Payload.encode(items)` only at the publication edge.
   *
   * @param params - Tree to ratify.
   * @returns Items containing each offer and its ratifier data.
   * @throws InvalidOfferTreeError when the tree is invalid.
   * @example
   * ```ts
   * import { SetterRatifier } from "@morpho-org/midnight-sdk";
   *
   * const items = SetterRatifier.ratify({ tree: [{} as never] });
   * console.log(items[0]?.ratifierData);
   * ```
   */
  public static ratify(params: {
    readonly tree: TreeInput;
  }): readonly PayloadItem[] {
    return SetterRatifierUtils.ratify(params);
  }

  /**
   * Decodes SetterRatifier data.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded ratifier data.
   * @example
   * ```ts
   * import { SetterRatifier } from "@morpho-org/midnight-sdk";
   *
   * const decoded = SetterRatifier.decodeRatifierData("0x" as never);
   * console.log(decoded.root);
   * ```
   */
  public static decodeRatifierData(data: Hex): DecodedSetterRatifierData {
    return SetterRatifierUtils.decodeRatifierData(data);
  }

  /**
   * Builds a SetterRatifier root-approval call.
   *
   * @param params - Root approval parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { SetterRatifier } from "@morpho-org/midnight-sdk";
   *
   * const call = SetterRatifier.approveRoot({} as never);
   * console.log(call.to);
   * ```
   */
  public static approveRoot(params: {
    readonly setterRatifier: Address;
    readonly maker: Address;
    readonly root: Hash;
    readonly newIsRootRatified?: boolean;
  }): { readonly to: Address; readonly data: Hex } {
    return SetterRatifierUtils.buildRootApprovalCall(params);
  }
}
