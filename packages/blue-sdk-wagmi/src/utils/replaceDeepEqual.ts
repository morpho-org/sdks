export function isPlainArray(value: unknown) {
  return Array.isArray(value) && value.length === Object.keys(value).length;
}

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 * It may be unsafe to use with JS classes or other non-plain objects because it will not preserve the prototype chain.
 */
export function replaceDeepEqual<T>(a: unknown, b: T): T;
// biome-ignore lint/suspicious/noExplicitAny: safe implementation
export function replaceDeepEqual(a: any, b: any): any {
  if (a === b) return a;

  if (
    a == null ||
    typeof a === "number" ||
    typeof a === "string" ||
    typeof a === "boolean" ||
    typeof a === "bigint" ||
    typeof a === "symbol" ||
    b == null
  )
    return b;

  const array = isPlainArray(a) && isPlainArray(b);

  const aItems = array ? a : Object.keys(a);
  const aSize = aItems.length;
  const bItems = array ? b : Object.keys(b);
  const bSize = bItems.length;
  const copy = Object.create(
    Object.getPrototypeOf(a),
    Object.getOwnPropertyDescriptors(a),
  );

  let equalItems = 0;

  for (let i = 0; i < aSize; i++) {
    const key = array ? i : aItems[i];

    if (!array && !bItems.includes(key)) {
      delete copy[key];
      continue;
    }
    if (
      ((!array && bItems.includes(key)) || array) &&
      a[key] === undefined &&
      b[key] === undefined
    ) {
      copy[key] = undefined;
      equalItems++;
    } else {
      copy[key] = replaceDeepEqual(a[key], b[key]);
      if (copy[key] === a[key] && a[key] !== undefined) {
        equalItems++;
      }
    }
  }

  return aSize === bSize && equalItems === aSize ? a : copy;
}
