/**
 * Response headers applied to every page and API response.
 *
 * 'unsafe-inline' for scripts is required because SSR streams inline hydration data and the app has
 * an inline theme script. Removing it would need per-request nonces wired through the router.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "media-src 'self' blob: data:",
  // The service worker fetches fonts, and its requests are subject to this list.
  "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "microphone=(self), camera=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=15552000",
};

/**
 * Recordings are only ever played by an audio element. Even if a stored file were not really audio,
 * these stop a browser from sniffing it or running anything inside it when opened directly.
 */
export const AUDIO_RESPONSE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Content-Disposition": "inline",
};
