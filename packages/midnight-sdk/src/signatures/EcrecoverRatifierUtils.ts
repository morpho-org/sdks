import { type BigIntish, deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Account,
  type Address,
  type Chain,
  type Client,
  concat,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hash,
  type Hex,
  keccak256,
  parseSignature,
  recoverAddress,
  type Signature,
  serializeSignature,
  type Transport,
  verifyHash,
} from "viem";
import { signTypedData } from "viem/actions";
import { EIP712_DOMAIN_TYPEHASH } from "../constants.js";
import {
  ChainIdMismatchError,
  InvalidEcrecoverSignatureVError,
  InvalidTreeError,
  InvalidTreeHeightError,
  InvalidTypedDataSignatureError,
} from "../errors.js";
import { MarketParams } from "../market/index.js";
import { type IOffer, Offer, type OfferStruct } from "../offers/index.js";
import type { Payload } from "./Payload.js";
import { RatifierUtils } from "./RatifierUtils.js";
import {
  type RatifierTreeInput,
  type TreeProof,
  TreeUtils,
} from "./TreeUtils.js";

const treeTypeHashes = [
  "0x270da1ebafc0f24637af3612fb8c3a1d828fcb56d3637c24e86dd006b12ca7f9",
  "0x828b9cdf8326a1cf234328e4d5229546a98fb72ef73624f5b6b31538e555b96c",
  "0xfcb7a3ca4094246b8185620c4cf025c93032b6f0384805aa3f22afe04290e982",
  "0xcc97cb1955496a5269b5a7afca62ba694edcab26ba838a1adbd257931249de92",
  "0xda3feb08db360ad9e09540132ff04d2b6a596fdaa4747892217aaa4c7c9bcc31",
  "0x15bd6e2aa1a7a61614187ac16d2cbf8610c8f2f3c3d9eaa380ae7a501ee3cf06",
  "0xb726cb7fab1a24c28213cbd482fa5a301f127fb25feb01da341919983a72711a",
  "0xcea9cd557c6f821868ea287304199d0e0554af630bfa8fe36c64eb3bbacca418",
  "0xf7dbde8234e8e345cec8fc0a8ac5909ee336b214882751ecd51e7b37df4f6cdd",
  "0x5400a5d43d39e6bfe910af8cb84ac77bf501d310413769dffd62ccecda8b00c6",
  "0x0754209b60d99d0822b3ecd5a970f9db09df9c8998a8441e24b81f06d6c76fee",
  "0xf5d561d88647c3b38ed6636709d3166819fc66f8ed52a0daf4ae186387b4646c",
  "0x5801c07a6c7df039ce00a7a2b8bd92aa1cf333c30b0bc3d78768590b6063d09e",
  "0xc9da7190eaf4b14c7cb1c14f9898256c0adb6b1dc303afe79594dea64fe199c0",
  "0xa47534c85ac57c583568465d40fd46683d2d558d8129fe1aca01e93023afca92",
  "0xb1e841691fb54f4ef85e2ed9de45d610e57f49e1e6eb2510ceead16e447dd519",
  "0x4fa4f16f09f0c36c7670449a4032073380d28a60071e12ee8874bb3e5a8318fc",
  "0x817bbaac8bb863670f488b454cdd5d0990d9d81871a68e9df381c3c13d3f2ba2",
  "0xc447f06079bddf4b011523c4bce119e9e90fdf937de4ee88f48010406560e9c1",
  "0x1608d5eb56943c667c34b413f9f8a1c24a84ddfe1301a9c25487e638de1f5822",
  "0x3a677100d2e855c24a62d1e9c365bff90d02287f066a07064843ca1ee70ea113",
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
    { name: "liquidationCursor", type: "uint256" },
    { name: "oracle", type: "address" },
  ],
  Market: [
    { name: "chainId", type: "uint256" },
    { name: "midnight", type: "address" },
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
    { name: "maxUnits", type: "uint128" },
    { name: "maxAssets", type: "uint128" },
    { name: "continuousFeeCap", type: "uint256" },
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

function toCanonicalYParity(v: number): 0 | 1 {
  if (v === 27) return 0;
  if (v === 28) return 1;

  throw new InvalidEcrecoverSignatureVError(v);
}

/**
 * Decoded EcrecoverRatifier ratifier data.
 *
 * Use this on the take-side or in diagnostics after `Payload.decode` when you
 * need to inspect the signature and proof attached to an Ecrecover offer.
 *
 * @example
 * ```ts
 * import { EcrecoverRatifierUtils, type DecodedEcrecoverRatifierData } from "@morpho-org/midnight-sdk";
 * import { zeroHash } from "viem";
 *
 * const data = EcrecoverRatifierUtils.encodeRatifierData({
 *   signature: { v: 27, r: zeroHash, s: zeroHash },
 *   root: zeroHash,
 *   leafIndex: 0n,
 *   proof: [],
 * });
 * const decoded: DecodedEcrecoverRatifierData =
 *   EcrecoverRatifierUtils.decodeRatifierData(data);
 * console.log(decoded.signature.v);
 * ```
 */
export interface DecodedEcrecoverRatifierData extends TreeProof {
  /** Ecrecover signature tuple decoded from ratifier data. */
  readonly signature: Signature<number, number> & { readonly v: number };
}

/**
 * Ecrecover typed-data descriptor returned to signing code.
 *
 * Pass this descriptor to the maker or authorized signer before payload
 * encoding. The resulting signature is later embedded into every payload item
 * for the tree.
 *
 * @example
 * ```ts
 * import { EcrecoverRatifierUtils, Offer, Tree, type EcrecoverRatificationTypedData } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     chainId: 8453,
 *     midnight: "0x0000000000000000000000000000000000001000",
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         liquidationCursor: 250000000000000000n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
 *     maturity: 54_000n,
 *     rcfThreshold: 0n,
 *     enterGate: zeroAddress,
 *     liquidatorGate: zeroAddress,
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000009000",
 *   tick: 5_000n,
 *   expiry: 3_600n,
 *   ratifier: "0x0000000000000000000000000000000000004000",
 *   maxUnits: 100n,
 * });
 * const typedData: EcrecoverRatificationTypedData =
 *   EcrecoverRatifierUtils.typedData({
 *     tree: Tree.create([offer]),
 *     chainId: 8453n,
 *   });
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
 * Hex string or viem signature accepted by Ecrecover ratifier helpers.
 *
 * @example
 * ```ts
 * import type { EcrecoverSignatureInput } from "@morpho-org/midnight-sdk";
 *
 * const signature = "0x" as EcrecoverSignatureInput;
 * console.log(signature);
 * ```
 */
export type EcrecoverSignatureInput =
  | Hex
  | Signature
  | Signature<number, number>;

/**
 * Parameters for {@link EcrecoverRatifierUtils.typedData}.
 *
 * Use these after `Tree.create` and after the maker route has been classified
 * as `ecrecover`.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type EcrecoverRatifierTypedDataParams } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     chainId: 8453,
 *     midnight: "0x0000000000000000000000000000000000001000",
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         liquidationCursor: 250000000000000000n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
 *     maturity: 54_000n,
 *     rcfThreshold: 0n,
 *     enterGate: zeroAddress,
 *     liquidatorGate: zeroAddress,
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000009000",
 *   tick: 5_000n,
 *   expiry: 3_600n,
 *   ratifier: "0x0000000000000000000000000000000000004000",
 *   maxUnits: 100n,
 * });
 * const params: EcrecoverRatifierTypedDataParams = {
 *   tree: Tree.create([offer]),
 *   chainId: 8453n,
 * };
 * console.log(params.chainId);
 * ```
 */
export interface EcrecoverRatifierTypedDataParams {
  /** Tree-like input being ratified. Existing `Tree` instances reuse cached hashes and proofs. */
  readonly tree: RatifierTreeInput;
  /** Chain id used by the EIP-712 domain. */
  readonly chainId: BigIntish;
}

/**
 * Parameters for {@link EcrecoverRatifierUtils.ratify}.
 *
 * Use this after tree validation. Provide either a signing client plus account
 * or a precomputed signature plus the account that produced it.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type EcrecoverRatifierRatifyParams } from "@morpho-org/midnight-sdk";
 * import { zeroAddress, zeroHash } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     chainId: 8453,
 *     midnight: "0x0000000000000000000000000000000000001000",
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         liquidationCursor: 250000000000000000n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
 *     maturity: 54_000n,
 *     rcfThreshold: 0n,
 *     enterGate: zeroAddress,
 *     liquidatorGate: zeroAddress,
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000009000",
 *   tick: 5_000n,
 *   expiry: 3_600n,
 *   ratifier: "0x0000000000000000000000000000000000004000",
 *   maxUnits: 100n,
 * });
 * const params: EcrecoverRatifierRatifyParams = {
 *   tree: Tree.create([offer]),
 *   account: "0x0000000000000000000000000000000000009000",
 *   signature: { v: 27, r: zeroHash, s: zeroHash },
 * };
 * console.log(params.tree);
 * ```
 */
export type EcrecoverRatifierRatifyParams =
  | {
      /** Tree-like input being ratified. */
      readonly tree: RatifierTreeInput;
      /** Viem client whose transport signs the typed data built from `tree`. */
      readonly client: Client<Transport, Chain, Account | undefined>;
      /** Account that signs the tree root. It may be the maker or an address authorized by each maker. */
      readonly account: Account | Address;
      /** Omit when the SDK should request the signature through `client`. */
      readonly signature?: undefined;
    }
  | {
      /** Tree-like input being ratified. */
      readonly tree: RatifierTreeInput;
      /** Precomputed signature for this tree root. */
      readonly signature: EcrecoverSignatureInput;
      /** Account that produced the signature. It may be the maker or an address authorized by each maker. */
      readonly account: Account | Address;
      /** Omit when a precomputed signature is supplied. */
      readonly client?: undefined;
      /** Omit when a precomputed signature is supplied. */
      readonly chainId?: undefined;
    };

/**
 * Parameters for one EcrecoverRatifier ratifier-data value.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type EcrecoverRatifierDataParams } from "@morpho-org/midnight-sdk";
 * import { zeroAddress, zeroHash } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     chainId: 8453,
 *     midnight: "0x0000000000000000000000000000000000001000",
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         liquidationCursor: 250000000000000000n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
 *     maturity: 54_000n,
 *     rcfThreshold: 0n,
 *     enterGate: zeroAddress,
 *     liquidatorGate: zeroAddress,
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000009000",
 *   tick: 5_000n,
 *   expiry: 3_600n,
 *   ratifier: "0x0000000000000000000000000000000000004000",
 *   maxUnits: 100n,
 * });
 * const params: EcrecoverRatifierDataParams = {
 *   tree: Tree.create([offer]),
 *   leafIndex: 0n,
 *   signature: { v: 27, r: zeroHash, s: zeroHash },
 * };
 * console.log(params.leafIndex);
 * ```
 */
export interface EcrecoverRatifierDataParams {
  /** Tree-like input that produced the proof. Existing `Tree` instances reuse cached hashes and proofs. */
  readonly tree: RatifierTreeInput;
  /** Leaf index to prove. */
  readonly leafIndex: BigIntish;
  /** Ecrecover signature for the tree root. */
  readonly signature: EcrecoverSignatureInput;
}

/** Parameters for reconstructing an EcrecoverRatifier digest from decoded ratifier data fields. */
export interface EcrecoverRatifierRootDigestParams {
  /** Observed EIP-155 chain id from the log or execution context. Must match `offer.market.chainId`. */
  readonly chainId: BigIntish;
  /** Offer whose ratifier address and market chain id define the EIP-712 domain. */
  readonly offer: IOffer;
  /** Merkle root embedded in the ratifier data. */
  readonly root: Hash;
  /** Number of sibling hashes in the Merkle proof. */
  readonly proofLength: number;
}

/** Parameters for reconstructing an EcrecoverRatifier digest from encoded ratifier data. */
export interface EcrecoverRatifierDataDigestParams {
  /** Observed EIP-155 chain id from the log or execution context. Must match `offer.market.chainId`. */
  readonly chainId: BigIntish;
  /** Offer carried by the payload item. */
  readonly offer: IOffer;
  /** ABI-encoded Ecrecover ratifier data carried by the payload item. */
  readonly ratifierData: Hex;
}

/** Parameters for locally verifying Ecrecover ratifier data attached to one payload item. */
export interface EcrecoverRatifierDataVerificationParams {
  /** Observed EIP-155 chain id from the log or execution context. Must match `offer.market.chainId`. */
  readonly chainId: BigIntish;
  /** Offer carried by the payload item. */
  readonly offer: IOffer;
  /** ABI-encoded Ecrecover ratifier data carried by the payload item. */
  readonly ratifierData: Hex;
}

/** Decoded Ecrecover ratifier data after local proof verification and signature recovery. */
export interface VerifiedEcrecoverRatifierData
  extends DecodedEcrecoverRatifierData {
  /** Signer recovered from the Ecrecover typed-data digest. */
  readonly signer: Address;
}

/**
 * EcrecoverRatifier-specific pure utilities.
 *
 * Use this route for EOA and EIP-7702 makers. The make-side sequence is:
 * create offers with the Ecrecover ratifier address, build the group/tree,
 * validate the tree, sign the typed data, call `ratify`, then pass the returned
 * items to `Payload.encode`. Ecrecover trees must contain one ratifier; split
 * trees by ratifier before signing. The signer may be the maker or an address
 * authorized by every maker in the tree. Ratifier helpers accept tree-like
 * inputs rather than requiring the `Tree` class. Passing an existing `Tree`
 * remains the optimal path because its cached offers, leaves, root, and height
 * are reused for typed data and per-leaf proofs.
 *
 * @example
 * ```ts
 * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(EcrecoverRatifierUtils.treeTypeHash(0));
 * ```
 */
export namespace EcrecoverRatifierUtils {
  /**
   * Returns the Solidity HashLib tree typehash for a tree height.
   *
   * @param height - Tree height.
   * @returns Tree typehash.
   * @throws {InvalidTreeHeightError} when height exceeds 20.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * console.log(EcrecoverRatifierUtils.treeTypeHash(0));
   * ```
   */
  export function treeTypeHash(height: number) {
    const typehash = treeTypeHashes[height];
    if (typehash == null) throw new InvalidTreeHeightError(height);

    return typehash;
  }

  /**
   * Builds EcrecoverRatifier typed data for a tree-like input.
   *
   * Use after the tree is built and validated, before requesting the signer
   * signature. The EIP-712 verifier is derived from the shared ratifier address
   * on the tree offers. `ratify` calls this for you when given a client and
   * account.
   *
   * @param params.tree - Ecrecover-ratified offer tree-like input to sign.
   * @param params.chainId - EIP-155 chain id included in the EIP-712 domain.
   * @returns EIP-712 typed-data descriptor.
   * @throws {InvalidTreeError} when the tree is invalid or contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when the tree height is unsupported.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   *
   * const typedData = EcrecoverRatifierUtils.typedData({
   *   tree: Tree.create([offer]),
   *   chainId: 8453n,
   * });
   * console.log(typedData.primaryType);
   * ```
   */
  export function typedData(
    params: EcrecoverRatifierTypedDataParams,
  ): EcrecoverRatificationTypedData {
    const { tree, ratifier: verifyingContract } =
      RatifierUtils.normalizeRatifierTree({
        tree: params.tree,
        label: "Ecrecover",
      });
    const treeType =
      tree.height === 0 ? "Offer" : `Offer${"[2]".repeat(tree.height)}`;

    return deepFreeze({
      domain: {
        chainId: BigInt(params.chainId),
        verifyingContract,
      },
      types: {
        ...typedDataTypes,
        OfferTree: [{ name: "offerTree", type: treeType }],
      },
      primaryType: "OfferTree",
      message: {
        offerTree: buildTreeValue(tree.paddedOffers),
      },
    });
  }

  /**
   * Builds the EcrecoverRatifier digest used by the Solidity ratifier.
   *
   * @param params.tree - Ecrecover-ratified offer tree-like input to hash.
   * @param params.chainId - EIP-155 chain id included in the EIP-712 domain.
   * @returns EIP-712 digest.
   * @throws {InvalidTreeError} when the tree contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when height exceeds 20.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   *
   * const digest = EcrecoverRatifierUtils.digest({
   *   tree: Tree.create([offer]),
   *   chainId: 8453n,
   * });
   * console.log(digest);
   * ```
   */
  export function digest(params: EcrecoverRatifierTypedDataParams) {
    const { tree, ratifier: verifyingContract } =
      RatifierUtils.normalizeRatifierTree({
        tree: params.tree,
        label: "Ecrecover",
      });
    const domainSeparator = keccak256(
      encodeAbiParameters(domainSeparatorAbi, [
        EIP712_DOMAIN_TYPEHASH,
        BigInt(params.chainId),
        verifyingContract,
      ]),
    );
    const structHash = keccak256(
      encodeAbiParameters(treeStructHashAbi, [
        treeTypeHash(tree.height),
        tree.root,
      ]),
    );

    return keccak256(concat(["0x1901", domainSeparator, structHash]));
  }

  /**
   * Builds the EcrecoverRatifier digest from a payload offer, root, and proof height.
   *
   * Use this on the take-side or in indexers after decoding ratifier data, when
   * the original full tree is not available but the payload item includes the
   * offer and proof metadata needed to reconstruct the signed digest. Pass the
   * observed log or execution chain id so cross-chain-spoofed payloads are
   * rejected before signature recovery.
   *
   * @param params.chainId - Observed EIP-155 chain id from the log or execution context.
   * @param params.offer - Offer carried by the payload item.
   * @param params.root - Merkle root embedded in the ratifier data.
   * @param params.proofLength - Number of sibling hashes in the Merkle proof.
   * @returns EIP-712 digest signed by the maker or authorized signer.
   * @throws {ChainIdMismatchError} when `params.chainId` does not match `offer.market.chainId`.
   * @throws {InvalidTreeHeightError} when `proofLength` exceeds 20.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   * import { zeroHash } from "viem";
   *
   * const digest = EcrecoverRatifierUtils.digestForRoot({
   *   chainId: 8453n,
   *   offer,
   *   root: zeroHash,
   *   proofLength: 0,
   * });
   * console.log(digest);
   * ```
   */
  export function digestForRoot(
    params: EcrecoverRatifierRootDigestParams,
  ): Hash {
    const offer = Offer.from(params.offer);
    const market = MarketParams.from(offer.market);
    const chainId = BigInt(params.chainId);
    if (chainId !== market.chainId) {
      throw new ChainIdMismatchError(Number(chainId), market.chainId);
    }
    const domainSeparator = keccak256(
      encodeAbiParameters(domainSeparatorAbi, [
        EIP712_DOMAIN_TYPEHASH,
        chainId,
        offer.ratifier,
      ]),
    );
    const structHash = keccak256(
      encodeAbiParameters(treeStructHashAbi, [
        treeTypeHash(params.proofLength),
        params.root,
      ]),
    );

    return keccak256(concat(["0x1901", domainSeparator, structHash]));
  }

  /**
   * Builds the EcrecoverRatifier digest from one payload item's encoded ratifier data.
   *
   * @param params.chainId - Observed EIP-155 chain id from the log or execution context.
   * @param params.offer - Offer carried by the payload item.
   * @param params.ratifierData - ABI-encoded Ecrecover ratifier data.
   * @returns EIP-712 digest signed by the maker or authorized signer.
   * @throws {ChainIdMismatchError} when `params.chainId` does not match `offer.market.chainId`.
   * @throws {InvalidTreeHeightError} when the proof height exceeds 20.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const digest = EcrecoverRatifierUtils.digestRatifierData({
   *   chainId: 8453n,
   *   offer,
   *   ratifierData,
   * });
   * console.log(digest);
   * ```
   */
  export function digestRatifierData(
    params: EcrecoverRatifierDataDigestParams,
  ): Hash {
    const decoded = decodeRatifierData(params.ratifierData);

    return digestForRoot({
      chainId: params.chainId,
      offer: params.offer,
      root: decoded.root,
      proofLength: decoded.proof.length,
    });
  }

  /**
   * Verifies an Ecrecover ratifier-data proof and recovers its signer.
   *
   * This helper intentionally does not check `Midnight.isAuthorized` or
   * `EcrecoverRatifier.isRootCanceled` state. Consumers must query both at the
   * observed block before treating a recovered item as executable: the returned
   * signer must be the maker or authorized by the maker, the offer ratifier must
   * be authorized by the maker, and `isRootCanceled(maker, root)` must be false.
   *
   * @param params.chainId - Observed EIP-155 chain id from the log or execution context.
   * @param params.offer - Offer carried by the payload item.
   * @param params.ratifierData - ABI-encoded Ecrecover ratifier data.
   * @returns Decoded ratifier data plus recovered signer.
   * @throws {ChainIdMismatchError} when `params.chainId` does not match `offer.market.chainId`.
   * @throws {InvalidEcrecoverSignatureVError} when the decoded signature `v` is not 27 or 28.
   * @throws {InvalidTreeError} when the proof does not include `offer` in `root`.
   * @throws {InvalidTreeHeightError} when the proof height exceeds 20.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const verified = await EcrecoverRatifierUtils.verifyRatifierData({
   *   chainId: 8453n,
   *   offer,
   *   ratifierData,
   * });
   * console.log(verified.signer);
   * ```
   */
  export async function verifyRatifierData(
    params: EcrecoverRatifierDataVerificationParams,
  ): Promise<VerifiedEcrecoverRatifierData> {
    const offer = Offer.from(params.offer);
    const decoded = decodeRatifierData(params.ratifierData);
    if (
      !TreeUtils.verifyProof({
        offer,
        root: decoded.root,
        leafIndex: decoded.leafIndex,
        proof: decoded.proof,
      })
    ) {
      throw new InvalidTreeError("Ratifier data proof does not include offer.");
    }

    const signer = await recoverAddress({
      hash: digestForRoot({
        chainId: params.chainId,
        offer,
        root: decoded.root,
        proofLength: decoded.proof.length,
      }),
      signature: serializeSignature({
        r: decoded.signature.r,
        s: decoded.signature.s,
        yParity: toCanonicalYParity(decoded.signature.v),
      }),
    });

    return deepFreeze({
      ...decoded,
      signer,
    });
  }

  /**
   * Signs EcrecoverRatifier typed data through a viem client.
   *
   * Use when app code wants the signature separately from payload item
   * construction. If you only need payload items, call `ratify` with the same
   * client and account. The account may be the maker or an address authorized
   * by every maker in the tree; the protocol checks that authorization onchain.
   *
   * @param params.tree - Ecrecover-ratified offer tree-like input to sign.
   * @param params.client - Viem client whose transport signs the tree typed data.
   * @param params.account - Account used to sign the tree typed data.
   * @returns Signature returned by the client.
   * @throws {InvalidTreeError} when the tree is invalid, contains multiple ratifiers, or spans multiple chain ids.
   * @throws {InvalidTreeHeightError} when the tree height is unsupported.
   * @throws {ChainIdMismatchError} when `params.client.chain?.id` does not match the tree offer chain id.
   * @throws {InvalidTypedDataSignatureError} when the returned signature does not recover to `params.account`.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { createWalletClient, http, zeroAddress } from "viem";
   * import { base } from "viem/chains";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const client = createWalletClient({
   *   chain: base,
   *   transport: http(),
   * });
   *
   * const signature = await EcrecoverRatifierUtils.sign({
   *   tree: Tree.create([offer]),
   *   client,
   *   account: offer.maker,
   * });
   * console.log(signature);
   * ```
   */
  export async function sign(params: {
    readonly tree: RatifierTreeInput;
    readonly client: Client<Transport, Chain, Account | undefined>;
    readonly account: Account | Address;
  }): Promise<Hex> {
    const { tree } = RatifierUtils.normalizeRatifierTree({
      tree: params.tree,
      label: "Ecrecover",
    });
    const expectedChainId = MarketParams.from(tree.offers[0]!.market).chainId;
    for (const offer of tree.offers.slice(1)) {
      const offerChainId = MarketParams.from(offer.market).chainId;
      if (offerChainId !== expectedChainId) {
        throw new InvalidTreeError(
          `All offers in an Ecrecover tree must use one chain id; expected "${expectedChainId}", got "${offerChainId}". Build separate trees per chain.`,
        );
      }
    }

    const clientChainId = params.client.chain?.id;
    if (clientChainId == null || BigInt(clientChainId) !== expectedChainId) {
      throw new ChainIdMismatchError(clientChainId, expectedChainId);
    }

    const signer =
      typeof params.account === "string"
        ? params.account
        : params.account.address;
    const data = typedData({
      tree,
      chainId: expectedChainId,
    });

    const signature = await signTypedData<
      Record<string, unknown>,
      "OfferTree",
      Chain,
      Account | undefined
    >(params.client, {
      account: params.account,
      ...data,
    });

    let isValidSignature = false;
    try {
      isValidSignature = await verifyHash({
        address: signer,
        hash: digest({ tree, chainId: expectedChainId }),
        signature,
      });
    } catch (cause) {
      throw new InvalidTypedDataSignatureError(signer, cause);
    }

    if (!isValidSignature) {
      throw new InvalidTypedDataSignatureError(signer);
    }

    return signature;
  }

  /**
   * Converts a hex ECDSA signature into the Solidity tuple shape.
   *
   * @param signature - Hex string or tuple signature.
   * @returns Signature tuple.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   * import { zeroHash } from "viem";
   *
   * const signature = EcrecoverRatifierUtils.toSignature({
   *   v: 27,
   *   r: zeroHash,
   *   s: zeroHash,
   * });
   * console.log(signature.v);
   * ```
   */
  export function toSignature(
    signature: EcrecoverSignatureInput,
  ): Signature<number, number> & { readonly v: number } {
    if (typeof signature !== "string") {
      const v =
        signature.v != null ? Number(signature.v) : Number(signature.yParity);
      return {
        v: v < 27 ? v + 27 : v,
        r: signature.r,
        s: signature.s,
      };
    }

    const parsed = parseSignature(signature);
    const v = Number(parsed.v ?? BigInt(parsed.yParity));
    return {
      v: v < 27 ? v + 27 : v,
      r: parsed.r,
      s: parsed.s,
    };
  }

  /**
   * Encodes EcrecoverRatifier ratifier data.
   *
   * Use only when you already have a signature and proof. Most maker flows call
   * `ratifierData` for one leaf or `ratify` for every leaf in the tree.
   *
   * @param params.signature - Signature tuple encoded into the ratifier data.
   * @param params.root - Merkle root approved by the signature.
   * @param params.leafIndex - Leaf index proven by `params.proof`.
   * @param params.proof - Merkle proof siblings for the leaf.
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
    readonly signature: Signature | Signature<number, number>;
    readonly root: Hash;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hash[];
  }) {
    const signature = toSignature(params.signature);

    return encodeAbiParameters(signatureAbi, [
      {
        v: signature.v,
        r: signature.r,
        s: signature.s,
      },
      params.root,
      BigInt(params.leafIndex),
      params.proof,
    ]);
  }

  /**
   * Decodes EcrecoverRatifier ratifier data.
   *
   * Use on the take-side or in tests after `Payload.decode` to inspect the
   * proof/signature attached to a published offer.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded Ecrecover ratifier data.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   * import { zeroHash } from "viem";
   *
   * const data = EcrecoverRatifierUtils.encodeRatifierData({
   *   signature: { v: 27, r: zeroHash, s: zeroHash },
   *   root: zeroHash,
   *   leafIndex: 0n,
   *   proof: [],
   * });
   * const decoded = EcrecoverRatifierUtils.decodeRatifierData(data);
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
   * Use after a tree has been signed when a caller needs data for one offer
   * leaf. Use `ratify` to produce payload-ready items for the whole tree.
   *
   * @param params.tree - Ecrecover-ratified offer tree-like input that produced the proof.
   * @param params.leafIndex - Leaf index to prove.
   * @param params.signature - Ecrecover signature for the tree root.
   * @returns ABI-encoded EcrecoverRatifier data.
   * @throws {InvalidTreeError} when the leaf index is outside the tree or the tree contains multiple ratifiers.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Offer, Tree } from "@morpho-org/midnight-sdk";
   * import { zeroAddress, zeroHash } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const data = EcrecoverRatifierUtils.ratifierData({
   *   tree: Tree.create([offer]),
   *   leafIndex: 0n,
   *   signature: { v: 27, r: zeroHash, s: zeroHash },
   * });
   * console.log(data);
   * ```
   */
  export function ratifierData(params: EcrecoverRatifierDataParams): Hex {
    const { tree } = RatifierUtils.normalizeRatifierTree({
      tree: params.tree,
      label: "Ecrecover",
    });
    const proof = TreeUtils.buildProof({ tree, leafIndex: params.leafIndex });

    return encodeRatifierData({
      signature: toSignature(params.signature),
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
    });
  }

  /**
   * Signs or consumes a tree signature and returns payload-ready items.
   *
   * Use after `Tree.mempoolValidate` and before `Payload.encode`.
   * The returned items preserve tree leaf order and include ratifier data
   * required by takers. The group id is stored on each inline offer.
   *
   * @param params.tree - Ecrecover-ratified offer tree-like input to ratify.
   * @param params.client - Optional viem client whose transport signs typed data built from `params.tree`.
   * @param params.account - Optional account used to sign typed data built from `params.tree`.
   * @param params.signature - Optional precomputed signature for `params.tree`.
   * @returns Items containing each offer and its ratifier data.
   * @throws {InvalidTreeError} when the tree is invalid or contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when the tree height is unsupported.
   * @throws {InvalidTypedDataSignatureError} when client signing or a precomputed signature does not recover to `params.account`.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { createWalletClient, http, zeroAddress } from "viem";
   * import { base } from "viem/chains";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const client = createWalletClient({
   *   chain: base,
   *   transport: http(),
   * });
   *
   * const items = await EcrecoverRatifierUtils.ratify({
   *   tree: Tree.create([offer]),
   *   client,
   *   account: offer.maker,
   * });
   * console.log(items.length);
   * ```
   */
  export async function ratify(
    params: EcrecoverRatifierRatifyParams,
  ): Promise<readonly Payload.Item[]> {
    const { tree } = RatifierUtils.normalizeRatifierTree({
      tree: params.tree,
      label: "Ecrecover",
    });
    let signature: Signature<number, number> & { readonly v: number };
    if (params.signature != null) {
      signature = toSignature(params.signature);
      const expectedChainId = MarketParams.from(tree.offers[0]!.market).chainId;
      for (const offer of tree.offers.slice(1)) {
        const offerChainId = MarketParams.from(offer.market).chainId;
        if (offerChainId !== expectedChainId) {
          throw new InvalidTreeError(
            `All offers in an Ecrecover tree must use one chain id; expected "${expectedChainId}", got "${offerChainId}". Build separate trees per chain.`,
          );
        }
      }

      const signer =
        typeof params.account === "string"
          ? params.account
          : params.account.address;
      let isValidSignature = false;
      try {
        isValidSignature = await verifyHash({
          address: signer,
          hash: digest({ tree, chainId: expectedChainId }),
          signature: serializeSignature({
            r: signature.r,
            s: signature.s,
            yParity: signature.v - 27,
          }),
        });
      } catch (cause) {
        throw new InvalidTypedDataSignatureError(signer, cause);
      }

      if (!isValidSignature) {
        throw new InvalidTypedDataSignatureError(signer);
      }
    } else {
      signature = toSignature(
        await sign({
          tree,
          client: params.client,
          account: params.account,
        }),
      );
    }
    const items: Payload.Item[] = [];

    for (const offer of tree.offers) {
      items.push({
        offer,
        ratifierData: ratifierData({
          tree,
          leafIndex: items.length,
          signature,
        }),
      });
    }

    return items;
  }
}
