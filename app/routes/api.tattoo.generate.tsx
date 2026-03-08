/**
 * POST /api/tattoo/generate
 *
 * Starts a tattoo generation job.
 * Body: { prompt: string, customerId: string, shop: string }
 * Returns: { jobId: string, generationId: string }
 *
 * Flow:
 * 1. Check customer credits via Shopify metafield
 * 2. Deduct one credit
 * 3. Call Timo's API to start generation
 * 4. Store job in D1
 * 5. Return job ID for polling
 */

import type { ActionFunctionArgs } from "react-router";
import { getDb, executeQuery } from "../db.server";
import { startGeneration } from "../services/timo-api.server";
import {
  getOfflineSession,
  getCustomerCredits,
  setCustomerCredits,
} from "../services/shopify-admin.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { prompt, customerId, shop } = body as {
      prompt?: string;
      customerId?: string;
      shop?: string;
    };

    if (!prompt || !customerId || !shop) {
      return Response.json(
        { error: "Missing required fields: prompt, customerId, shop" },
        { status: 400 },
      );
    }

    // Get Shopify offline session for this shop
    const session = await getOfflineSession(shop);

    // Check credits
    const credits = await getCustomerCredits(
      session.shop,
      session.accessToken,
      customerId,
    );

    if (credits <= 0) {
      return Response.json(
        { error: "No credits remaining", credits: 0 },
        { status: 402 },
      );
    }

    // Deduct one credit
    await setCustomerCredits(
      session.shop,
      session.accessToken,
      customerId,
      credits - 1,
    );

    // Call Timo's API to start generation
    const env = context.cloudflare.env;
    const { jobId } = await startGeneration(
      env.TIMO_API_BASE_URL,
      env.TIMO_API_AUTH_TOKEN,
      prompt,
      shop,
    );

    // Store in D1
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const db = getDb();
    await executeQuery(
      db,
      `INSERT INTO generations (id, job_id, shop, customer_id, prompt, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [generationId, jobId, shop, customerId, prompt],
    );

    return Response.json({
      jobId,
      generationId,
      creditsRemaining: credits - 1,
    });
  } catch (error) {
    console.error("Generate error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
