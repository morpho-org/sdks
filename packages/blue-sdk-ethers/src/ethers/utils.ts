import { parseUnits, getAddress, ZeroAddress, AddressLike } from "ethers";

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
    throw new Error("invalid number: " + strValue);

  let [whole, dec = ""] = strValue.split(".");

  dec = dec.slice(0, decimals);

  return parseUnits(
    [whole || "0", dec].filter((v) => v.length > 0).join("."),
    decimals,
  );
};

/**
 * Check if an address is the zero address, null, or undefined.
 *
 * @param address - The address to check, which can be a valid address, null, or undefined.
 * @returns True if the address is zero, null, or undefined; otherwise, false.
 */
export const isZeroAddressOrUnset = (
  address: string | null | undefined,
): address is "0x0000000000000000000000000000000000000000" =>
  address == null || address === ZeroAddress;

/**
 * Transform an AddressLike into a checksumed address
 *
 * @param address Address to transform
 */
export const getChecksumedAddress = async (address: AddressLike) => {
  const awaited = await address;
  // Ethers getAddress function is throwing an error if the address is already checksumed

  if (typeof awaited === "string") return getAddress(awaited.toLowerCase());

  return getAddress((await awaited.getAddress()).toLowerCase());
};
