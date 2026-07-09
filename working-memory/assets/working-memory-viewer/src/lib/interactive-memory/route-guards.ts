import "server-only";

const ALLOWED_ORIGIN_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

export class ForbiddenOriginError extends Error {
  constructor() {
    super("Cross-origin requests are not allowed.");
    this.name = "ForbiddenOriginError";
  }
}

// The studio server binds 127.0.0.1 only, but its mutating POST/DELETE routes are CORS
// "simple requests": a page on any origin can fire them blindly (responses are opaque
// cross-origin, so this is quota-burn/CSRF-class exposure, not data exfiltration). Reject
// any request that carries an Origin header outside the local dev surface.
export function assertLocalOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new ForbiddenOriginError();
  }
  if (parsed.protocol !== "http:" || !ALLOWED_ORIGIN_HOSTNAMES.has(parsed.hostname)) {
    throw new ForbiddenOriginError();
  }
}
