const MASK_64 = (1n << 64n) - 1n;

const RATE_BYTES = 136;

const ROTATION_OFFSETS = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
];

const ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];

const rotl64 = (value: bigint, offset: number): bigint => {
  if (offset === 0) return value;
  const shift = BigInt(offset);

  return ((value << shift) | (value >> (64n - shift))) & MASK_64;
};

const keccakF1600 = (state: bigint[]): void => {
  const b = new Array<bigint>(25).fill(0n);

  for (const rc of ROUND_CONSTANTS) {
    // Theta: column parity at state[25..29] (scratch lanes).
    for (let x = 0; x < 5; x++)
      state[x + 25] =
        state[x]! ^
        state[x + 5]! ^
        state[x + 10]! ^
        state[x + 15]! ^
        state[x + 20]!;

    for (let x = 0; x < 5; x++) {
      const d =
        state[((x + 4) % 5) + 25]! ^ rotl64(state[((x + 1) % 5) + 25]!, 1);
      for (let y = 0; y < 5; y++) state[x + 5 * y] = state[x + 5 * y]! ^ d;
    }

    // Rho and Pi.
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(
          state[x + 5 * y]!,
          ROTATION_OFFSETS[x + 5 * y]!,
        );
      }
    }

    // Chi.
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x + 5 * y] =
          b[x + 5 * y]! ^
          (~b[((x + 1) % 5) + 5 * y]! & b[((x + 2) % 5) + 5 * y]! & MASK_64);
      }
    }

    // Iota.
    state[0] = state[0]! ^ rc;
  }
};

/**
 * Encodes a string as UTF-8 bytes.
 *
 * @param s - The string to encode.
 * @returns The UTF-8 byte representation.
 * @internal
 */
export const utf8ToBytes = (s: string): Uint8Array =>
  new TextEncoder().encode(s);

/**
 * Computes the Keccak-256 digest of a byte array (Ethereum's hash, with
 * Keccak padding `0x01 ... 0x80` — not the SHA-3 `0x06` variant).
 *
 * @param bytes - The input bytes to hash.
 * @returns The 32-byte digest.
 * @internal
 */
export const keccak256 = (bytes: Uint8Array): Uint8Array => {
  const state = new Array<bigint>(50).fill(0n);

  const padded = new Uint8Array(
    bytes.length + RATE_BYTES - (bytes.length % RATE_BYTES),
  );
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1]! |= 0x80;

  for (let offset = 0; offset < padded.length; offset += RATE_BYTES) {
    for (let i = 0; i < RATE_BYTES / 8; i++) {
      let lane = 0n;
      for (let j = 7; j >= 0; j--)
        lane = (lane << 8n) | BigInt(padded[offset + i * 8 + j]!);
      state[i] = state[i]! ^ lane;
    }

    keccakF1600(state);
  }

  const digest = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = state[i]!;
    for (let j = 0; j < 8; j++) {
      digest[i * 8 + j] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }

  return digest;
};
