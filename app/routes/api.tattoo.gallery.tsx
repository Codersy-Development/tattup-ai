/**
 * GET /api/tattoo/gallery?customerId=gid://shopify/Customer/123&shop=tattup.myshopify.com
 *
 * Returns the customer's tattoo generation history.
 * Fetches from both D1 (for pending/in-progress) and Shopify metaobjects (for completed).
 */

import type { LoaderFunctionArgs } from "react-router";
import { getDb, getAllRows } from "../db.server";
import {
  getOfflineSession,
  getCustomerTattoos,
  getCustomerCredits,
} from "../services/shopify-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const shop = url.searchParams.get("shop");

  if (!customerId || !shop) {
    return Response.json(
      { error: "Missing required query params: customerId, shop" },
      { status: 400 },
    );
  }

  try {
    const session = await getOfflineSession(shop);

    // Fetch completed tattoos from Shopify metaobjects
    let shopifyTattoos: Array<{
      id: string;
      prompt: string;
      imageUrl: string;
      createdAt: string;
    }> = [];

    try {
      shopifyTattoos = await getCustomerTattoos(
        session.shop,
        session.accessToken,
        customerId,
      );
    } catch (err) {
      // Metaobjects might not be set up yet - fall back to D1 only
      console.error("Metaobject query failed (falling back to D1):", err);
    }

    // Fetch in-progress jobs from D1
    const db = getDb();
    const pendingResult = await getAllRows(
      db,
      `SELECT id, job_id, prompt, status, created_at
       FROM generations
       WHERE customer_id = ? AND shop = ? AND status != 'completed'
       ORDER BY created_at DESC`,
      [customerId, shop],
    );

    // Get current credits
    const credits = await getCustomerCredits(
      session.shop,
      session.accessToken,
      customerId,
    );

    return Response.json({
      credits,
      completed: shopifyTattoos,
      pending: pendingResult.results || [],
    });
  } catch (error) {
    console.error("Gallery error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
