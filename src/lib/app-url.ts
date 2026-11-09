/**
 * Absolute link to a page of this deployment, for messages sent outside the app. It uses the address
 * the teacher is actually on, so links always lead to the same site.
 */
export function appUrl(path: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${path}`;
}
