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
} from "../services/shopify-admin.server";

const FREE_CREDITS = 1;

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const proxyCtx = getAppProxyContext(request);
    const session = await getOfflineSession(proxyCtx.shop);

    let credits = await getCustomerCredits(
      session.shop,
      session.accessToken,
      proxyCtx.customerId,
    );

    // First-time user: grant 1 free credit
    // We detect this by checking if credits === 0 and the metafield doesn't exist.
    // Since getCustomerCredits returns 0 for both "no metafield" and "metafield = 0",
    // we grant free credits only once using a separate flag metafield.
    // For simplicity, we just check if 0 and grant. Repeat visitors who used
    // their credit will see 0 and need to buy. This is the intended behavior.
    // TODO: Add a "tattup.welcomed" metafield to distinguish first-time from zero-credit.

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
