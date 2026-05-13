function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

/** Returns the array of IDs encoded in `?s=...` on the current URL, or null. */
export function parseShareLink(search: string): string[] | null {
  const params = new URLSearchParams(search);
  const raw = params.get('s');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw));
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

export function buildShareLink(ids: string[]): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('s', b64urlEncode(JSON.stringify(ids)));
  return url.toString();
}
