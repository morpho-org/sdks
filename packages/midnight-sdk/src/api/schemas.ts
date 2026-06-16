import { isAddress, isHex, size } from "viem";
import { z } from "zod";

import type {
  Payload as MidnightPayload,
  Item as MidnightPayloadItem,
} from "../signatures/Payload.js";
import type { TreeInput } from "../signatures/Tree.js";
import type { MidnightApiFetch, MidnightApiRequestOptions } from "./types.js";

const SLIPPAGE_REGEX = /^\d+(?:\.\d)?$/;
const BOOK_SORT_FIELDS = ["id", "ask", "bid", "maturity"] as const;

const objectSchema = z.object({}).catchall(z.unknown());
const recordSchema = z.record(z.string(), z.unknown());
const baseUrlSchema = z.union([z.url(), z.instanceof(URL)]);
const fetchSchema = z.custom<MidnightApiFetch>(
  (value) => typeof value === "function",
  { message: "fetch must be a function" },
);
const requestOptionsSchema = z.custom<MidnightApiRequestOptions>(
  (value) => {
    const result = recordSchema.safeParse(value);
    return (
      result.success && !("method" in result.data) && !("body" in result.data)
    );
  },
  {
    message: "request must be fetch options without method or body",
  },
);
const timestampSchema = z
  .union([z.iso.datetime(), z.instanceof(Date)])
  .refine(
    (value) => typeof value === "string" || !Number.isNaN(value.getTime()),
    { message: "timestamp Date must be valid" },
  );
const positiveIntegerSchema = z.number().int().positive();
const nonEmptyStringSchema = z.string().min(1);
const evmAddressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), {
    message: "address must be a valid EVM address",
  });
const hexSchema = z.custom<`0x${string}`>((value) => isHex(value), {
  message: "value must be a hex string",
});
const hex32Schema = hexSchema.refine(
  (value) => size(value) === 32 && value.length === 66,
  {
    message: "value must be 32 bytes",
  },
);
const hex32ArraySchema = z.array(hex32Schema).readonly();
const hex32FilterArraySchema = z.array(hex32Schema).max(20).readonly();
const evmAddressFilterArraySchema = z
  .array(evmAddressSchema)
  .max(20)
  .readonly();
const positiveIntegerArraySchema = z.array(positiveIntegerSchema).readonly();
const positiveIntegerFilterArraySchema = z
  .array(positiveIntegerSchema)
  .max(20)
  .readonly();
const nonEmptyStringArraySchema = z.array(nonEmptyStringSchema).readonly();
const bookChainIdsSchema = z.array(positiveIntegerSchema).max(1).readonly();
const sortTermSchema = nonEmptyStringSchema.refine(isBookSortTerm, {
  message: "sort field must be one of id, ask, bid, or maturity",
});
const sortStringSchema = nonEmptyStringSchema.refine(isBookSortString, {
  message: "sort must contain at most 3 supported fields",
});
const sortArraySchema = z.array(sortTermSchema).max(3).readonly();
const sortSchema = z.union([sortStringSchema, sortArraySchema]);
const positiveBigIntishSchema = z.union([
  z.string().regex(/^[1-9]\d*$/),
  positiveIntegerSchema.max(Number.MAX_SAFE_INTEGER),
  z.bigint().positive(),
]);
const slippageStringSchema = z
  .string()
  .regex(SLIPPAGE_REGEX)
  .refine((value) => {
    const numericValue = Number(value);
    return numericValue >= 0.1 && numericValue <= 100;
  }, "slippage must be between 0.1 and 100");
const slippageNumberSchema = z
  .number()
  .min(0.1)
  .max(100)
  .refine(
    (value) => Number.isInteger(value * 10),
    "slippage must have at most one decimal place",
  );
const slippageSchema = z.union([slippageStringSchema, slippageNumberSchema]);
const payloadSchema = hexSchema.transform((value) => value as MidnightPayload);
const payloadOfferSchema = z.custom<MidnightPayloadItem["offer"]>(
  (value) => objectSchema.safeParse(value).success,
  { message: "offer must be an object" },
);
const payloadItemSchema = z
  .object({
    offer: payloadOfferSchema,
    ratifierData: hexSchema,
  })
  .strict()
  .readonly();
const payloadItemsSchema = z.array(payloadItemSchema).readonly();
const treeInputSchema = z.custom<TreeInput>(
  (value) => objectSchema.safeParse(value).success,
  { message: "tree must be an object" },
);

const midnightApiConfigShape = {
  baseUrl: baseUrlSchema.optional(),
  fetch: fetchSchema.optional(),
  request: requestOptionsSchema.optional(),
};

function paramsSchema<const Shape extends z.ZodRawShape>(shape: Shape) {
  return z
    .object({
      ...midnightApiConfigShape,
      ...shape,
    })
    .strict()
    .readonly();
}

function isBookSortTerm(value: string) {
  const field = value.startsWith("-") ? value.slice(1) : value;
  return (BOOK_SORT_FIELDS as readonly string[]).includes(field);
}

function isBookSortString(value: string) {
  const fields = value.split(",");
  return fields.length <= 3 && fields.every(isBookSortTerm);
}

/**
 * Zod schema for shared Midnight API request configuration.
 *
 * @example
 * ```ts
 * import { midnightApiConfigSchema } from "@morpho-org/midnight-sdk";
 *
 * const config = midnightApiConfigSchema.parse({
 *   baseUrl: "https://api.morpho.org",
 * });
 * console.log(config.baseUrl);
 * ```
 */
export const midnightApiConfigSchema = z
  .object(midnightApiConfigShape)
  .strict()
  .readonly();

/**
 * Zod schema for the Midnight API constructor argument.
 *
 * @example
 * ```ts
 * import { midnightApiConstructorConfigSchema } from "@morpho-org/midnight-sdk";
 *
 * const config = midnightApiConstructorConfigSchema.parse("https://api.morpho.org");
 * console.log(config);
 * ```
 */
export const midnightApiConstructorConfigSchema = z.union([
  baseUrlSchema,
  midnightApiConfigSchema,
]);

/**
 * Zod schema for Midnight API book sides.
 *
 * @example
 * ```ts
 * import { midnightApiBookSideSchema } from "@morpho-org/midnight-sdk";
 *
 * const side = midnightApiBookSideSchema.parse("asks");
 * console.log(side);
 * ```
 */
export const midnightApiBookSideSchema = z.enum(["asks", "bids"]);

/**
 * Zod schema for router config contract names.
 *
 * @example
 * ```ts
 * import { midnightApiConfigContractNameSchema } from "@morpho-org/midnight-sdk";
 *
 * const name = midnightApiConfigContractNameSchema.parse("midnight");
 * console.log(name);
 * ```
 */
export const midnightApiConfigContractNameSchema = z.enum([
  "setterRatifier",
  "bundler",
  "ecrecoverAuthorizer",
  "ecrecoverRatifier",
  "mempool",
  "multicall",
  "midnight",
]);

/**
 * Zod schema for {@link MidnightApi.validateMempoolPayload} parameters.
 *
 * @example
 * ```ts
 * import { validateMempoolPayloadParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = validateMempoolPayloadParamsSchema.parse({
 *   chainId: 8453,
 *   payload: "0x0100000000",
 * });
 * console.log(params.chainId);
 * ```
 */
export const validateMempoolPayloadParamsSchema = paramsSchema({
  chainId: positiveIntegerSchema,
  payload: payloadSchema,
  timestamp: timestampSchema.optional(),
});

/**
 * Zod schema for {@link MidnightApi.validateMempoolItems} parameters.
 *
 * @example
 * ```ts
 * import { validateMempoolItemsParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = validateMempoolItemsParamsSchema.parse({
 *   chainId: 8453,
 *   items: [{ offer: {} as never, ratifierData: "0x" }],
 * });
 * console.log(params.items.length);
 * ```
 */
export const validateMempoolItemsParamsSchema = paramsSchema({
  chainId: positiveIntegerSchema,
  items: payloadItemsSchema,
  timestamp: timestampSchema.optional(),
});

/**
 * Zod schema for {@link MidnightApi.validateMempoolTree} parameters.
 *
 * @example
 * ```ts
 * import { validateMempoolTreeParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = validateMempoolTreeParamsSchema.parse({
 *   chainId: 8453,
 *   tree: { groups: [[{} as never]] },
 * });
 * console.log(params.chainId);
 * ```
 */
export const validateMempoolTreeParamsSchema = paramsSchema({
  chainId: positiveIntegerSchema,
  tree: treeInputSchema,
  timestamp: timestampSchema.optional(),
});

/**
 * Zod schema for {@link MidnightApi.fetchMempoolRules} parameters.
 *
 * @example
 * ```ts
 * import { fetchMempoolRulesParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = fetchMempoolRulesParamsSchema.parse({
 *   chainIds: [8453],
 *   types: ["tick_spacing"],
 * });
 * console.log(params.types?.[0]);
 * ```
 */
export const fetchMempoolRulesParamsSchema = paramsSchema({
  chainIds: positiveIntegerArraySchema.optional(),
  types: nonEmptyStringArraySchema.optional(),
  timestamp: timestampSchema.optional(),
  limit: positiveIntegerSchema.optional(),
  cursor: nonEmptyStringSchema.optional(),
});

/**
 * Zod schema for {@link MidnightApi.fetchConfigContracts} parameters.
 *
 * @example
 * ```ts
 * import { fetchConfigContractsParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = fetchConfigContractsParamsSchema.parse({
 *   chainIds: [8453],
 *   limit: 10,
 * });
 * console.log(params.chainIds?.[0]);
 * ```
 */
export const fetchConfigContractsParamsSchema = paramsSchema({
  chainIds: positiveIntegerArraySchema.optional(),
  limit: positiveIntegerSchema.optional(),
  cursor: nonEmptyStringSchema.optional(),
});

/**
 * Zod schema for {@link MidnightApi.fetchBooks} parameters.
 *
 * @example
 * ```ts
 * import { fetchBooksParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = fetchBooksParamsSchema.parse({
 *   chainIds: [8453],
 *   sort: ["-ask", "maturity"],
 * });
 * console.log(params.chainIds?.[0]);
 * ```
 */
export const fetchBooksParamsSchema = paramsSchema({
  sort: sortSchema.optional(),
  maturities: positiveIntegerFilterArraySchema.optional(),
  collateralTokens: evmAddressFilterArraySchema.optional(),
  loanTokens: evmAddressFilterArraySchema.optional(),
  chainIds: bookChainIdsSchema.optional(),
  marketIds: hex32FilterArraySchema.optional(),
  limit: positiveIntegerSchema.optional(),
  cursor: nonEmptyStringSchema.optional(),
});

/**
 * Zod schema for {@link MidnightApi.fetchBook} parameters.
 *
 * @example
 * ```ts
 * import { fetchBookParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = fetchBookParamsSchema.parse({
 *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
 *   depth: 100,
 * });
 * console.log(params.depth);
 * ```
 */
export const fetchBookParamsSchema = paramsSchema({
  marketId: hex32Schema,
  depth: positiveIntegerSchema.max(5_821).optional(),
});

/**
 * Zod schema for {@link MidnightApi.fetchBookPriceLevels} parameters.
 *
 * @example
 * ```ts
 * import { fetchBookPriceLevelsParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = fetchBookPriceLevelsParamsSchema.parse({
 *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
 *   side: "bids",
 * });
 * console.log(params.side);
 * ```
 */
export const fetchBookPriceLevelsParamsSchema = paramsSchema({
  marketId: hex32Schema,
  side: midnightApiBookSideSchema,
  depth: positiveIntegerSchema.max(5_821).optional(),
});

/**
 * Zod schema for {@link MidnightApi.fetchBookTakeableOffers} parameters.
 *
 * @example
 * ```ts
 * import { fetchBookTakeableOffersParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = fetchBookTakeableOffersParamsSchema.parse({
 *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
 *   side: "asks",
 * });
 * console.log(params.marketId);
 * ```
 */
export const fetchBookTakeableOffersParamsSchema = paramsSchema({
  marketId: hex32Schema,
  side: midnightApiBookSideSchema,
});

/**
 * Zod schema for {@link MidnightApi.fetchBookQuote} parameters.
 *
 * @example
 * ```ts
 * import { fetchBookQuoteParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = fetchBookQuoteParamsSchema.parse({
 *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
 *   side: "asks",
 *   assets: 1000000000000000000n,
 *   slippage: "0.5",
 * });
 * console.log(params.assets);
 * ```
 */
export const fetchBookQuoteParamsSchema = paramsSchema({
  marketId: hex32Schema,
  side: midnightApiBookSideSchema,
  averageWorstPrice: positiveBigIntishSchema.optional(),
  slippage: slippageSchema.optional(),
  units: positiveBigIntishSchema.optional(),
  assets: positiveBigIntishSchema.optional(),
}).superRefine((value, context) => {
  const hasAssets = value.assets !== undefined;
  const hasUnits = value.units !== undefined;
  if (hasAssets === hasUnits) {
    context.addIssue({
      code: "custom",
      path: ["assets"],
      message: 'Provide exactly one of "assets" or "units".',
    });
    context.addIssue({
      code: "custom",
      path: ["units"],
      message: 'Provide exactly one of "assets" or "units".',
    });
  }

  const hasAverageWorstPrice = value.averageWorstPrice !== undefined;
  const hasSlippage = value.slippage !== undefined;
  if (hasAverageWorstPrice && hasSlippage) {
    context.addIssue({
      code: "custom",
      path: ["averageWorstPrice"],
      message: 'Provide only one of "averageWorstPrice" or "slippage".',
    });
    context.addIssue({
      code: "custom",
      path: ["slippage"],
      message: 'Provide only one of "averageWorstPrice" or "slippage".',
    });
  }
});

/**
 * Zod schema for {@link MidnightApi.fetchTakeableOffers} parameters.
 *
 * @example
 * ```ts
 * import { fetchTakeableOffersParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = fetchTakeableOffersParamsSchema.parse({
 *   maker: "0x7b093658BE7f90B63D7c359e8f408e503c2D9401",
 *   marketIds: ["0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67"],
 * });
 * console.log(params.maker);
 * ```
 */
export const fetchTakeableOffersParamsSchema = paramsSchema({
  maker: evmAddressSchema,
  marketIds: hex32FilterArraySchema.optional(),
  groups: hex32FilterArraySchema.optional(),
  limit: positiveIntegerSchema.optional(),
  cursor: nonEmptyStringSchema.optional(),
});

/**
 * Zod schema for {@link MidnightApi.fetchUserOffers} parameters.
 *
 * @example
 * ```ts
 * import { fetchUserOffersParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = fetchUserOffersParamsSchema.parse({
 *   user: "0x7b093658BE7f90B63D7c359e8f408e503c2D9401",
 *   active: true,
 * });
 * console.log(params.user);
 * ```
 */
export const fetchUserOffersParamsSchema = paramsSchema({
  user: evmAddressSchema,
  marketIds: hex32ArraySchema.optional(),
  groups: hex32ArraySchema.optional(),
  active: z.boolean().optional(),
  limit: positiveIntegerSchema.optional(),
  cursor: nonEmptyStringSchema.optional(),
});

/**
 * Zod schema for {@link MidnightApi.fetchUserGroups} parameters.
 *
 * @example
 * ```ts
 * import { fetchUserGroupsParamsSchema } from "@morpho-org/midnight-sdk";
 *
 * const params = fetchUserGroupsParamsSchema.parse({
 *   user: "0x7b093658BE7f90B63D7c359e8f408e503c2D9401",
 * });
 * console.log(params.user);
 * ```
 */
export const fetchUserGroupsParamsSchema = paramsSchema({
  user: evmAddressSchema,
  limit: positiveIntegerSchema.optional(),
  cursor: nonEmptyStringSchema.optional(),
});
