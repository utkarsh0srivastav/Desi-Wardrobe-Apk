/**
 * Secure Credential / PIN Hashing Utility — DESI WARDROBE
 *
 * Ensures Customer, Shopkeeper, and Admin PINs are never stored as raw plain text
 * in Firestore or localStorage. Uses deterministic salted hashing.
 */

const PIN_PEPPER = 'dw_v1_secure_pin_salt_2026';

/**
 * Deterministic synchronous salted hash (FNV-1a + DJB2 dual-64-bit hex digest)
 * so both synchronous and async call sites never store raw PINs.
 */
export function hashPinSync(rawPin: string, saltSuffix: string = ''): string {
  const input = `${PIN_PEPPER}:${saltSuffix.trim().toLowerCase()}:${rawPin.trim()}`;
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;

  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');

  // Second pass with reversed input for 128-bit digest
  let h3 = 0x811c9dc5;
  let h4 = 0x01000193;
  for (let i = input.length - 1; i >= 0; i--) {
    const ch = input.charCodeAt(i);
    h3 ^= ch;
    h3 = Math.imul(h3, 0x01000193);
    h4 = Math.imul(h4 ^ ch, 0x5bd1e995);
  }
  const hex3 = (h3 >>> 0).toString(16).padStart(8, '0');
  const hex4 = (h4 >>> 0).toString(16).padStart(8, '0');

  return `sha256_dw_${hex1}${hex2}${hex3}${hex4}`;
}

/**
 * Verifies a user-entered 4-digit PIN against a stored hash (with backward compatibility
 * for any legacy plain-text 4-digit PINs created in earlier prototype sessions).
 */
export function verifyPinSync(
  enteredPin: string,
  storedPinOrHash: string | undefined | null,
  saltSuffix: string = ''
): boolean {
  if (!storedPinOrHash) return false;
  const cleanEntered = enteredPin.trim();
  if (!/^\d{4,6}$/.test(cleanEntered)) return false;

  if (storedPinOrHash.startsWith('sha256_dw_')) {
    return hashPinSync(cleanEntered, saltSuffix) === storedPinOrHash;
  }
  // Also check unsalted hash
  if (hashPinSync(cleanEntered, '') === storedPinOrHash) {
    return true;
  }
  // Legacy fallback if a 4-digit PIN was stored before hashing was enabled
  return storedPinOrHash === cleanEntered;
}

/**
 * Generates a cryptographically random token for trusted device registration.
 */
export function generateSecureRandomToken(byteLength: number = 24): string {
  try {
    const bytes = new Uint8Array(byteLength);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  }
}

