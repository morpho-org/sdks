export type WithId<T> = T & { id: string };
export type WithIndex<T> = T & { index: number };

export type ArrayElementType<T> = T extends (infer U)[] ? U : never;

export type DottedKeys<T> = T extends object | null | undefined
  ? {
      [K in keyof T & string]: T[K] extends object | null | undefined
        ? `${K}.${DottedKeys<T[K]>}`
        : K;
    }[keyof T & string]
  : "";

export type PartialDottedKeys<T> = T extends object | null | undefined
  ? {
      [K in keyof T & string]: T[K] extends object | null | undefined
        ? `${K}.${PartialDottedKeys<T[K]>}` | K
        : K;
    }[keyof T & string]
  : "";

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
