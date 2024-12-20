export const uniqBy = <T>(
  iterable: Iterable<T>,
  iteratee: (value: T) => string,
): T[] => {
  const uniqueKeys = new Set<string>();

  const uniques: T[] = [];

  for (const value of iterable) {
    const key = iteratee(value);
    if (uniqueKeys.has(key)) continue;

    uniqueKeys.add(key);

    uniques.push(value);
  }

  return uniques;
};
