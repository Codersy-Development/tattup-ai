/**
 * GET /api/tattoo/status/:jobId
 *
 * Polls the status of a tattoo generation job.
 * When AI backend reports "completed":
 *   → Downloads image → Uploads to Shopify Files → Creates metaobject
 *   → Deducts credits → Returns URL
 */

import type { LoaderFunctionArgs } from "react-router";
import { getDb, getFirstRow, executeQuery } from "../db.server";
import { checkGenerationStatus } from "../services/timo-api.server";
import {
  getOfflineSession,
  getCustomerCredits,
  setCustomerCredits,
  uploadImageToShopifyFiles,
  createTattooMetaobject,
} from "../services/shopify-admin.server";

export async function loader({ params, context }: LoaderFunctionArgs) {
  const { jobId } = params;

  if (!jobId) {
    return Response.json({ error: "Missing jobId" }, { status: 400 });
  }

  try {
    const db = getDb();

    // Look up job context from D1
    const job = await getFirstRow(
      db,
      "SELECT * FROM generations WHERE job_id = ?",
      [jobId],
    );

    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    // Already completed and saved? Return cached result.
    if (job.status === "completed" && job.image_url) {
      return Response.json({
        status: "completed",
        imageUrl: job.image_url,
      });
    }

    // Poll AI backend
    const env = context.cloudflare.env;
    const aiStatus = await checkGenerationStatus(
      env.API_BASE_URL,
      env.API_AUTH_TOKEN,
      jobId,
    );

    console.log(`Job ${jobId} AI response:`, JSON.stringify(aiStatus));

    if (aiStatus.status !== "completed" || !aiStatus.imageUrl) {
      return Response.json({ status: aiStatus.status });
    }

    // === Image ready → save to Shopify ===

    const session = await getOfflineSession(job.shop as string);
    const prompt = job.prompt as string;
    const customerId = job.customer_id as string;
    const creditCost = (job.credit_cost as number) || 1;

    // Upload to Shopify Files
    const filename = `tattup-${jobId}.png`;
    const { fileId, fileUrl } = await uploadImageToShopifyFiles(
      session.shop,
      session.accessToken,
      aiStatus.imageUrl,
      filename,
      `Tattoo: ${prompt}`,
    );

    // Create metaobject for gallery (non-fatal if it fails)
    try {
      await createTattooMetaobject(session.shop, session.accessToken, {
        prompt,
        shopifyFileId: fileId,
        customerId,
        jobId,
      });
    } catch (err) {
      console.error("Metaobject creation failed (non-fatal):", err);
    }

    // Deduct credits now that generation succeeded
    const currentCredits = await getCustomerCredits(
      session.shop,
      session.accessToken,
      customerId,
    );
    await setCustomerCredits(
      session.shop,
      session.accessToken,
      customerId,
      Math.max(0, currentCredits - creditCost),
    );

    // Update D1 with completion
    await executeQuery(
      db,
      "UPDATE generations SET status = 'completed', image_url = ? WHERE job_id = ?",
      [fileUrl, jobId],
    );

    return Response.json({
      status: "completed",
      imageUrl: fileUrl,
      creditsRemaining: Math.max(0, currentCredits - creditCost),
    });
  } catch (error) {
    console.error("Status check error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
