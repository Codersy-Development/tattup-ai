/**
 * GET /api/tattoo/gallery
 *
 * Returns the customer's tattoo generation history.
 * App Proxy adds: ?shop=...&logged_in_customer_id=...
 */

import type { LoaderFunctionArgs } from "react-router";
import { getAppProxyContext } from "../services/app-proxy.server";
import {
  getOfflineSession,
  getCustomerTattoos,
} from "../services/shopify-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const proxyCtx = getAppProxyContext(request);
    const session = await getOfflineSession(proxyCtx.shop);

    let tattoos: Array<{
      id: string;
      prompt: string;
      imageUrl: string;
      createdAt: string;
    }> = [];

    try {
      tattoos = await getCustomerTattoos(
        session.shop,
        session.accessToken,
        proxyCtx.customerId,
      );
    } catch (err) {
      console.error("Metaobject query failed:", err);
    }

    return Response.json({ tattoos });
  } catch (error) {
    console.error("Gallery error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
