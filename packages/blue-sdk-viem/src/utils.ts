import { getAddress, parseUnits } from "viem";

// Alternative to Number.toFixed that doesn't use scientific notation for excessively small or large numbers.
const toFixed = (x: number, decimals: number) =>
  new Intl.NumberFormat("en-US", {
    style: "decimal",
    useGrouping: false,
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(x);

export const safeGetAddress = (address: string) =>
  getAddress(address.toLowerCase());

export const safeParseNumber = (value: number, decimals = 18) =>
  safeParseUnits(toFixed(value, decimals), decimals);

export const safeParseUnits = (strValue: string, decimals = 18) => {
  if (!/[-+]?[0-9]*\.?[0-9]+/.test(strValue))
    throw Error(`invalid number: ${strValue}`);

  let [whole, dec = ""] = strValue.split(".");

  dec = dec.slice(0, decimals);

  return parseUnits(
    [whole || "0", dec].filter((v) => v.length > 0).join("."),
    decimals,
  );
};
