import {
  GroupUtils,
  getBlueBuyCallbackAddress,
  MarketUtils,
  midnightBundlesV2Abi,
  type OfferStruct,
  OfferUtils,
  Payload,
  PriceRatifierV1,
  RateRatifierV1,
  Tree,
} from "@morpho-org/midnight-sdk";
import type { ChainAddresses } from "@morpho-org/morpho-ts";
import { marketParamsAbi } from "@morpho-org/morpho-ts/abis";
import { Gunzip } from "fflate";
import {
  type Address,
  encodeAbiParameters,
  type Hex,
  hexToBytes,
  keccak256,
  maxUint128,
  zeroAddress,
  zeroHash,
} from "viem";
import {
  checked,
  decode,
  mainCall,
  requireAccount,
  requireAmount,
  requireNativeBudget,
  requireTarget,
  sameAddress,
  sameHex,
  uint,
} from "./checks.js";
import {
  CalldataAmountError,
  CalldataCallError,
  CalldataDecodeError,
  CalldataTargetError,
  CalldataUnsupportedError,
} from "./errors.js";
import { checkCollateral, checkPrerequisites } from "./midnight.js";
import type {
  CalldataCall,
  DecodedCalldataCall,
  MidnightOfferManagementIntent,
} from "./types.js";

type MakeIntent = Extract<
  MidnightOfferManagementIntent,
  { readonly offers: unknown }
>;
type Entry = MakeIntent["offers"]["entries"][number];
type MakeLendIntent = Extract<
  MakeIntent,
  { readonly action: "midnight.make_lend" }
>;
type BlueFunding = {
  readonly funding: MakeLendIntent["funding"];
  readonly loanToken: Address;
  readonly assets: bigint;
  readonly salt: Hex;
  readonly callback: Address;
  readonly callbackData: Hex;
};
type Context = {
  readonly intent: MakeIntent;
  readonly chain: ChainAddresses;
  readonly call: CalldataCall;
  readonly cap: bigint;
  readonly blue?: BlueFunding;
};
type PublicationArgs = Extract<
  ReturnType<typeof decode<typeof midnightBundlesV2Abi>>,
  { functionName: "midnightBundlesV2CancelAndMake" }
>["args"];
type Leaf = {
  readonly offer: OfferStruct;
  readonly allowedTaker: Address;
  readonly rate?: bigint;
};

const sides = {
  "midnight.make_lend": { buy: true, reduceOnly: false, unit: "assets" },
  "midnight.make_borrow": { buy: false, reduceOnly: false, unit: "assets" },
  "midnight.make_repay": { buy: true, reduceOnly: true, unit: "units" },
  "midnight.make_withdraw": { buy: false, reduceOnly: true, unit: "units" },
} as const;

const GUNZIP_SLICE_BYTES = 1_024;

function gunzip(compressed: Uint8Array, maxBytes: number) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const stream = new Gunzip((chunk) => {
    length += chunk.length;
    if (length > maxBytes) {
      throw new RangeError(`gzip output exceeds ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  });
  // fflate inflates a whole push before reporting output, so small slices bound the work done past the cap.
  for (
    let offset = 0;
    offset < compressed.length;
    offset += GUNZIP_SLICE_BYTES
  ) {
    const end = offset + GUNZIP_SLICE_BYTES;
    stream.push(compressed.subarray(offset, end), end >= compressed.length);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function decodePayload(
  payload: Hex,
  { call, maxItems }: { call: CalldataCall; maxItems: number },
) {
  try {
    const bytes = hexToBytes(payload);
    // The API never appends an attribution suffix after the gzip stream.
    if (bytes.length !== 5 + new DataView(bytes.buffer).getUint32(1)) {
      throw new CalldataDecodeError("payload", call.id);
    }
    return Payload.decodeSync(payload, { gunzip, maxItems });
  } catch (cause) {
    if (cause instanceof CalldataDecodeError) {
      throw cause;
    }
    throw new CalldataDecodeError("payload", { callId: call.id, cause });
  }
}

function rebuildTree(
  items: readonly Payload.Item[],
  { intent, call }: Context,
) {
  try {
    if (intent.offers.type === "rate") {
      const entries = items.map(({ offer, ratifierData }) => ({
        offer,
        ...RateRatifierV1.decodeRatifierData(ratifierData),
      }));
      const tree = Tree.create({ type: "rateV1", entries });
      return {
        leaves: entries.map(
          ({ offer, rate, allowedTaker }): Leaf => ({
            offer: OfferUtils.toStruct({ offer }),
            rate,
            allowedTaker,
          }),
        ),
        root: tree.root,
        group: RateRatifierV1.groupId(entries),
        items: RateRatifierV1.ratify({ tree }),
      };
    }
    const entries = items.map(({ offer, ratifierData }) => ({
      offer,
      ...PriceRatifierV1.decodeRatifierData(ratifierData),
    }));
    const tree = Tree.create({ type: "priceV1", entries });
    return {
      leaves: entries.map(
        ({ offer, allowedTaker }): Leaf => ({
          offer: OfferUtils.toStruct({ offer }),
          allowedTaker,
        }),
      ),
      root: tree.root,
      group: PriceRatifierV1.groupId(entries),
      items: PriceRatifierV1.ratify({ tree }),
    };
  } catch (cause) {
    throw new CalldataCallError("payload", { callId: call.id, cause });
  }
}

function marketId(market: OfferStruct["market"], call: CalldataCall) {
  try {
    const sorted = market.collateralParams.every(
      (collateral, index) =>
        index === 0 ||
        MarketUtils.compareCollateralTokens(
          market.collateralParams[index - 1] as typeof collateral,
          collateral,
        ) < 0,
    );
    if (sorted) {
      return MarketUtils.toId(market);
    }
  } catch (cause) {
    throw new CalldataTargetError("market", { callId: call.id, cause });
  }
  throw new CalldataTargetError("market", call.id);
}

function checkOffer(
  { offer, rate }: Leaf,
  {
    entry,
    ratifier,
    cap,
    context: { intent, chain, call, blue },
  }: {
    entry: Entry;
    ratifier: Address;
    cap: bigint;
    context: Context;
  },
) {
  const { buy, reduceOnly, unit } = sides[intent.action];
  if (
    offer.market.chainId !== BigInt(intent.chain_id) ||
    !sameAddress(offer.market.midnight, chain.midnight) ||
    !sameHex(marketId(offer.market, call), entry.market_id)
  ) {
    throw new CalldataTargetError("offers.market_id", call.id);
  }
  requireAccount(offer.maker, {
    expected: intent.account,
    field: "offers.maker",
    call,
  });
  requireAccount(offer.receiverIfMakerIsSeller, {
    expected: buy ? zeroAddress : intent.account,
    field: "offers.receiver",
    call,
  });
  if (
    offer.buy !== buy ||
    offer.reduceOnly !== reduceOnly ||
    !sameAddress(offer.ratifier, ratifier) ||
    !sameAddress(offer.callback, blue?.callback ?? zeroAddress) ||
    !sameHex(offer.callbackData, blue?.callbackData ?? "0x") ||
    offer.continuousFeeCap !== 0n
  ) {
    throw new CalldataCallError("offers", call.id);
  }
  if (
    offer.start !==
      uint(String(entry.starts_at), { field: "offers.starts_at", call }) ||
    offer.expiry !==
      uint(String(entry.expires_at), { field: "offers.expires_at", call })
  ) {
    throw new CalldataAmountError("offers.expires_at", call.id);
  }
  if (
    (intent.offers.type === "price" || entry.tick != null) &&
    offer.tick !== uint(entry.tick ?? "", { field: "offers.tick", call })
  ) {
    throw new CalldataAmountError("offers.tick", call.id);
  }
  if (
    intent.offers.type === "rate" &&
    rate !==
      uint(("rate_wad" in entry ? entry.rate_wad : undefined) ?? "", {
        field: "offers.rate_wad",
        call,
      })
  ) {
    throw new CalldataAmountError("offers.rate_wad", call.id);
  }
  requireAmount(unit === "assets" ? offer.maxAssets : offer.maxUnits, {
    expected: blue == null ? cap : maxUint128,
    field: "amount",
    call,
  });
  requireAmount(unit === "assets" ? offer.maxUnits : offer.maxAssets, {
    expected: 0n,
    field: "amount",
    call,
  });
}

function checkOffers(args: PublicationArgs, context: Context) {
  const { intent, chain, call, cap } = context;
  const [, , , , , ratifier, root, , , , , , , , payload] = args;
  const { offers } = intent;
  const expectedRatifier =
    offers?.type === "rate" || offers?.type === "price"
      ? { rate: chain.rateRatifierV1, price: chain.priceRatifierV1 }[
          offers.type
        ]
      : undefined;
  if (expectedRatifier == null || !sameAddress(ratifier, expectedRatifier)) {
    throw new CalldataTargetError("ratifier", call.id);
  }
  if (
    !Array.isArray(offers.entries) ||
    offers.entries.length === 0 ||
    Array.from(offers.entries).some(
      (entry) => typeof entry !== "object" || entry == null,
    )
  ) {
    throw new CalldataCallError("offers.entries", call.id);
  }
  const items = decodePayload(payload, {
    call,
    maxItems: offers.entries.length,
  });
  if (items.length !== offers.entries.length) {
    throw new CalldataCallError("offers.entries", call.id);
  }
  const { blue } = context;
  if (
    blue != null &&
    !sameHex(
      blue.salt,
      GroupUtils.hash(
        items.map(({ offer }) => ({
          ...offer,
          maxAssets: cap,
          callback: zeroAddress,
          callbackData: "0x" as const,
        })),
      ),
    )
  ) {
    throw new CalldataCallError("callback_salt", call.id);
  }
  const tree = rebuildTree(items, context);
  if (
    !sameHex(tree.root, root) ||
    tree.items.some(
      ({ ratifierData }, index) =>
        !sameHex(ratifierData, items[index]?.ratifierData),
    )
  ) {
    throw new CalldataCallError("root", call.id);
  }
  const entries: readonly Entry[] = offers.entries;
  tree.leaves.forEach((leaf, index) => {
    if (!sameAddress(leaf.allowedTaker, zeroAddress)) {
      throw new CalldataCallError("offers.allowed_taker", call.id);
    }
    checkOffer(leaf, {
      entry: entries[index] as Entry,
      ratifier: expectedRatifier,
      cap,
      context,
    });
  });
  if (tree.leaves.some(({ offer }) => !sameHex(offer.group, tree.group))) {
    throw new CalldataCallError("offers.group", call.id);
  }
  return tree.leaves.map(({ offer }) => offer);
}

function checkEnvelope(args: PublicationArgs, { call }: Context) {
  const [
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    height,
    nonce,
    signatureDeadline,
    v,
    r,
    s,
    groupsToCancel,
    ,
    deadline,
  ] = args;
  if (
    height !== 0n ||
    nonce !== 0n ||
    signatureDeadline !== 0n ||
    v !== 0 ||
    !sameHex(r, zeroHash) ||
    !sameHex(s, zeroHash)
  ) {
    throw new CalldataCallError("root_signature", call.id);
  }
  if (groupsToCancel.length !== 0) {
    throw new CalldataCallError("cancellations", call.id);
  }
  if (deadline === 0n) {
    throw new CalldataAmountError("deadline", call.id);
  }
}

function checkBlueFunding(
  args: PublicationArgs,
  { intent, call, cap }: Omit<Context, "blue">,
): BlueFunding | undefined {
  const [market, assets, salt] = args;
  const source =
    intent.action === "midnight.make_lend" ? intent.funding_source : undefined;
  if (
    source != null &&
    !["wallet", "variable_rate_market"].includes(source.type)
  ) {
    throw new CalldataUnsupportedError("funding_source", call.id);
  }
  if (
    intent.action !== "midnight.make_lend" ||
    intent.funding_source?.type !== "variable_rate_market"
  ) {
    if (
      !sameAddress(market.loanToken, zeroAddress) ||
      !sameAddress(market.collateralToken, zeroAddress) ||
      !sameAddress(market.oracle, zeroAddress) ||
      !sameAddress(market.irm, zeroAddress) ||
      market.lltv !== 0n ||
      assets !== 0n ||
      !sameHex(salt, zeroHash)
    ) {
      throw new CalldataCallError("funding_source", call.id);
    }
    return undefined;
  }
  const callbackData = encodeAbiParameters([marketParamsAbi], [market]);
  if (!sameHex(keccak256(callbackData), intent.funding_source.market_id)) {
    throw new CalldataTargetError("funding_source.market_id", call.id);
  }
  if (cap === 0n || cap > maxUint128) {
    throw new CalldataAmountError("amount", call.id);
  }
  requireAmount(assets, {
    expected: cap,
    field: "amount",
    call,
  });
  return {
    funding: intent.funding,
    loanToken: market.loanToken,
    assets,
    salt,
    callback: getBlueBuyCallbackAddress({
      chainId: intent.chain_id,
      owner: intent.account,
      salt,
    }),
    callbackData,
  };
}

function checkCollateralSupplies(
  args: PublicationArgs,
  { offers, context }: { offers: readonly OfferStruct[]; context: Context },
) {
  const { intent, chain, call, blue } = context;
  const [, , , market, supplies, , , , , , , , , , , , wrappedNative] = args;
  const value = uint(call.value, { field: "value", call });
  const { requested, funding } =
    intent.action === "midnight.make_borrow"
      ? { requested: intent.collateral_supplies, funding: intent.funding }
      : { requested: undefined, funding: undefined };
  if (requested == null) {
    if (
      market.chainId !== 0n ||
      !sameAddress(market.midnight, zeroAddress) ||
      !sameAddress(market.loanToken, zeroAddress) ||
      market.collateralParams.length !== 0 ||
      market.maturity !== 0n ||
      market.rcfThreshold !== 0n ||
      !sameAddress(market.enterGate, zeroAddress) ||
      !sameAddress(market.liquidatorGate, zeroAddress) ||
      supplies.length !== 0 ||
      (blue == null &&
        (value !== 0n || !sameAddress(wrappedNative, zeroAddress)))
    ) {
      throw new CalldataCallError("collateral_supplies", call.id);
    }
    if (
      blue == null ||
      (value === 0n && sameAddress(wrappedNative, zeroAddress))
    ) {
      return [];
    }
    if (
      value === 0n ||
      !sameAddress(blue.loanToken, chain.wNative) ||
      !sameAddress(wrappedNative, chain.wNative) ||
      value > blue.assets
    ) {
      throw new CalldataAmountError("value", call.id);
    }
    requireNativeBudget(value, { funding: blue.funding, call });
    return [];
  }
  const collateralMarketId = marketId(market, call);
  if (
    market.chainId !== BigInt(intent.chain_id) ||
    !sameAddress(market.midnight, chain.midnight) ||
    offers.some(
      (offer) => !sameHex(marketId(offer.market, call), collateralMarketId),
    )
  ) {
    throw new CalldataTargetError("market", call.id);
  }
  const collateral = checkCollateral(supplies, { requested, market, call });
  if (value === 0n && sameAddress(wrappedNative, zeroAddress)) {
    return collateral;
  }
  const nativeCap =
    collateral.find(({ token }) => sameAddress(token, chain.wNative))?.assets ??
    0n;
  if (
    value === 0n ||
    !sameAddress(wrappedNative, chain.wNative) ||
    value > nativeCap
  ) {
    throw new CalldataAmountError("value", call.id);
  }
  requireNativeBudget(value, { funding, call });
  return collateral;
}

function loanTokenPulls(
  offers: readonly OfferStruct[],
  { intent, chain, call, cap, blue }: Context,
) {
  if (!sides[intent.action].buy) {
    return [];
  }
  const token = (offers[0] as OfferStruct).market.loanToken;
  if (blue != null && !sameAddress(blue.loanToken, token)) {
    throw new CalldataTargetError("funding_source.market_id", call.id);
  }
  return [
    {
      token,
      spender: blue == null ? chain.midnight : chain.midnightBundlesV2,
      assets: intent.action === "midnight.make_lend" ? cap : 0n,
    },
  ];
}

function verifyMake(
  intent: MakeIntent,
  {
    calls,
    chain,
  }: {
    readonly calls: readonly CalldataCall[];
    readonly chain: ChainAddresses;
  },
): readonly DecodedCalldataCall[] {
  const call = mainCall(calls, Number.MAX_SAFE_INTEGER);
  requireTarget(call, chain.midnightBundlesV2);
  const decoded = decode(call, { abi: midnightBundlesV2Abi });
  if (decoded.functionName !== "midnightBundlesV2CancelAndMake") {
    throw new CalldataCallError("function", call.id);
  }
  if (intent.amount?.unit !== sides[intent.action].unit) {
    throw new CalldataAmountError("amount.unit", call.id);
  }
  const base = {
    intent,
    chain,
    call,
    cap: uint(intent.amount.value, { field: "amount", call }),
  };
  const context = { ...base, blue: checkBlueFunding(decoded.args, base) };
  checkEnvelope(decoded.args, context);
  const offers = checkOffers(decoded.args, context);
  const collateral = checkCollateralSupplies(decoded.args, { offers, context });
  return [
    ...checkPrerequisites(calls.slice(0, -1), {
      ...context,
      pulls: [...collateral, ...loanTokenPulls(offers, context)],
      allowAuthorization: true,
    }),
    checked(call, decoded),
  ];
}

/** @internal */
export const midnightMakerRules = {
  "midnight.make_borrow": verifyMake,
  "midnight.make_lend": verifyMake,
  "midnight.make_repay": verifyMake,
  "midnight.make_withdraw": verifyMake,
};
