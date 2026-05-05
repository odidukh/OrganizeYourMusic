// PKCE per RFC 7636 with S256 challenge method.
// All output uses base64url encoding (no padding).

const VERIFIER_LENGTH = 64

function base64UrlEncode(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let str = ''
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(VERIFIER_LENGTH)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes.buffer)
}

export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(digest)
}
