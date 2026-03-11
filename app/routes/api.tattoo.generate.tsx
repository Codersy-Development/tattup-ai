/**
 * POST /api/tattoo/generate
 *
 * Starts a tattoo generation job.
 * Body: { prompt: string, model: "standard" | "pro", style?: string }
 * App Proxy adds: ?shop=...&logged_in_customer_id=...
 *
 * Flow:
 * 1. Validate customer is logged in (from App Proxy)
 * 2. Check credits (standard = 1, pro = 2) — reserve but don't deduct
 * 3. Call AI backend to start generation
 * 4. Store job in D1 for status tracking (credits deducted on completion)
 * 5. Return jobId for polling
 */

import type { ActionFunctionArgs } from "react-router";
import { getDb, executeQuery } from "../db.server";
import { startGeneration } from "../services/timo-api.server";
import { getAppProxyContext } from "../services/app-proxy.server";
import {
  getOfflineSession,
  getCustomerCredits,
} from "../services/shopify-admin.server";

const CREDIT_COSTS: Record<string, number> = {
  standard: 1,
  pro: 2,
};

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { prompt, model = "standard", style } = body as {
      prompt?: string;
      model?: string;
      style?: string;
    };

    if (!prompt) {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    // Get shop + customer from App Proxy params (or body fallback)
    const proxyCtx = getAppProxyContext(request, body);
    const session = await getOfflineSession(proxyCtx.shop);

    // Calculate credit cost
    const cost = CREDIT_COSTS[model] || 1;

    // Check credits (don't deduct yet — only on successful completion)
    const credits = await getCustomerCredits(
      session.shop,
      session.accessToken,
      proxyCtx.customerId,
    );

    if (credits < cost) {
      return Response.json(
        {
          error: "Insufficient credits",
          credits,
          required: cost,
        },
        { status: 402 },
      );
    }

    // Build the full prompt (include style if provided)
    const fullPrompt = style ? `${prompt} | Style: ${style}` : prompt;

    // Call AI backend
    const env = context.cloudflare.env;
    const { jobId } = await startGeneration(
      env.API_BASE_URL,
      env.API_AUTH_TOKEN,
      fullPrompt,
      proxyCtx.shop,
    );

    // Store job context in D1 for status lookups
    const db = getDb();
    await executeQuery(
      db,
      `INSERT INTO generations (job_id, shop, customer_id, prompt, model, status, credit_cost)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [jobId, proxyCtx.shop, proxyCtx.customerId, fullPrompt, model, cost],
    );

    return Response.json({
      jobId,
      creditsRemaining: credits,
    });
  } catch (error) {
    console.error("Generate error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
