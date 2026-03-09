/**
 * GET /api/tattoo/credits
 *
 * Returns the current customer's credit balance.
 * Also grants 1 free credit on first visit (if credits metafield doesn't exist).
 * App Proxy adds: ?shop=...&logged_in_customer_id=...
 */

import type { LoaderFunctionArgs } from "react-router";
import { getAppProxyContext } from "../services/app-proxy.server";
import {
  getOfflineSession,
  getCustomerCredits,
  setCustomerCredits,
  hasCustomerBeenWelcomed,
  setCustomerWelcomed,
} from "../services/shopify-admin.server";

const FREE_CREDITS = 1;

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const proxyCtx = getAppProxyContext(request);
    const session = await getOfflineSession(proxyCtx.shop);

    // Check if first-time user → grant free credit
    const welcomed = await hasCustomerBeenWelcomed(
      session.shop,
      session.accessToken,
      proxyCtx.customerId,
    );

    if (!welcomed) {
      await setCustomerCredits(
        session.shop,
        session.accessToken,
        proxyCtx.customerId,
        FREE_CREDITS,
      );
      await setCustomerWelcomed(
        session.shop,
        session.accessToken,
        proxyCtx.customerId,
      );
    }

    const credits = await getCustomerCredits(
      session.shop,
      session.accessToken,
      proxyCtx.customerId,
    );

    return Response.json({
      credits,
      customerId: proxyCtx.customerId,
    });
  } catch (error) {
    console.error("Credits error:", error);

    // If no customer context (not logged in), return 0
    if (
      error instanceof Error &&
      error.message.includes("Missing shop or customer")
    ) {
      return Response.json({ credits: 0, loggedIn: false });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
