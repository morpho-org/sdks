/**
 * Adds a string `id` field to a type.
 *
 * @deprecated This utility is unused in the monorepo. Use an explicit intersection type instead.
 */
export type WithId<T> = T & { id: string };

/**
 * Adds a numeric `index` field to a type.
 *
 * @deprecated This utility is unused in the monorepo. Use an explicit intersection type instead.
 */
export type WithIndex<T> = T & { index: number };

/**
 * Recursively marks every field of a type as optional.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extracts the element type from an array type.
 */
export type ArrayElementType<T> = T extends (infer U)[] ? U : never;

type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type NextDigit = [1, 2, 3, 4, 5, 6, 7, "MAX"];
type Inc<T> = T extends Digit ? NextDigit[T] : "MAX";

/**
 * Builds dot-separated paths for nested object leaves.
 */
export type DottedKeys<T, Depth = 0> = T extends object | null | undefined
  ? {
      [K in keyof T & string]: T[K] extends object | null | undefined
        ? `${K}.${
            // biome-ignore lint/suspicious/noExplicitAny: allow any keys from max depth on
            Depth extends "MAX" ? any : DottedKeys<T[K], Inc<Depth>>
          }`
        : K;
    }[keyof T & string]
  : "";

/**
 * Builds dot-separated paths for nested objects, including intermediate object keys.
 */
export type PartialDottedKeys<T, Depth = 0> = T extends
  | object
  | null
  | undefined
  ? {
      [K in keyof T & string]: T[K] extends object | null | undefined
        ?
            | `${K}.${
                // biome-ignore lint/suspicious/noExplicitAny: allow any keys from max depth on
                Depth extends "MAX" ? any : PartialDottedKeys<T[K], Inc<Depth>>
              }`
            | K
        : K;
    }[keyof T & string]
  : "";

/**
 * Resolves the field type addressed by a dot-separated path.
 */
export type FieldType<T, Path = PartialDottedKeys<T>> = T extends null
  ? FieldType<Exclude<T, null>, Path> | null
  : T extends undefined
    ? FieldType<Exclude<T, undefined>, Path> | undefined
    : Path extends keyof T
      ? T[Path]
      : Path extends `${infer Left}.${infer Right}`
        ? Left extends keyof T
          ? FieldType<T[Left], Right>
          : never
        : never;
