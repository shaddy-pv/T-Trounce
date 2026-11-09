import { createServerOnlyFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { env } from "@/config/env";
import { clientIpFromForwardedFor } from "./forwarded-for";

/** Best available client address for rate limiting. */
export const getClientIp = createServerOnlyFn((): string => {
  const forwarded = clientIpFromForwardedFor(
    getRequestHeader("x-forwarded-for"),
    env.TRUSTED_PROXY_HOPS,
  );
  return forwarded ?? getRequestIP() ?? "unknown";
});
