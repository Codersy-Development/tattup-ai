/**
 * GET /api/tattoo/status/:jobId
 *
 * Polls the status of a tattoo generation job.
 * Returns: { status, imageUrl?, shopifyFileUrl?, creditsRemaining? }
 *
 * When Timo's API reports "completed":
 * 1. Downloads the image
 * 2. Uploads to Shopify Files
 * 3. Creates a tattup_generation metaobject
 * 4. Updates D1 with final URLs
 * 5. Returns the Shopify file URL
 */

import type { LoaderFunctionArgs } from "react-router";
import { getDb, getFirstRow, executeQuery } from "../db.server";
import { checkGenerationStatus } from "../services/timo-api.server";
import {
  getOfflineSession,
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

    // Look up the job in D1
    const job = await getFirstRow(
      db,
      "SELECT * FROM generations WHERE job_id = ?",
      [jobId],
    );

    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    // If already completed and saved to Shopify, return cached result
    if (job.status === "completed" && job.shopify_file_url) {
      return Response.json({
        status: "completed",
        imageUrl: job.shopify_file_url,
        shopifyFileId: job.shopify_file_id,
        metaobjectId: job.metaobject_id,
      });
    }

    // Poll Timo's API
    const env = context.cloudflare.env;
    const timoStatus = await checkGenerationStatus(
      env.TIMO_API_BASE_URL,
      env.TIMO_API_AUTH_TOKEN,
      jobId,
    );

    // If not completed yet, return current status
    if (timoStatus.status !== "completed" || !timoStatus.result_url) {
      // Update status in D1 if changed
      if (timoStatus.status !== job.status) {
        await executeQuery(
          db,
          "UPDATE generations SET status = ?, updated_at = unixepoch() WHERE job_id = ?",
          [timoStatus.status, jobId],
        );
      }

      return Response.json({ status: timoStatus.status });
    }

    // === Image is ready - save to Shopify ===

    const session = await getOfflineSession(job.shop as string);
    const generationId = job.id as string;
    const prompt = job.prompt as string;
    const customerId = job.customer_id as string;

    // Update status to processing (saving to Shopify)
    await executeQuery(
      db,
      "UPDATE generations SET status = 'saving', timo_image_url = ?, updated_at = unixepoch() WHERE job_id = ?",
      [timoStatus.result_url, jobId],
    );

    // Upload image to Shopify Files
    const filename = `tattup-${generationId}.png`;
    const { fileId, fileUrl } = await uploadImageToShopifyFiles(
      session.shop,
      session.accessToken,
      timoStatus.result_url,
      filename,
      `Tattoo: ${prompt}`,
    );

    // Create metaobject entry for gallery
    let metaobjectId: string | null = null;
    try {
      metaobjectId = await createTattooMetaobject(
        session.shop,
        session.accessToken,
        {
          prompt,
          shopifyFileId: fileId,
          customerId,
          generationId,
        },
      );
    } catch (err) {
      // Metaobject creation is not critical - log and continue
      console.error("Metaobject creation failed (non-fatal):", err);
    }

    // Update D1 with final data
    await executeQuery(
      db,
      `UPDATE generations
       SET status = 'completed',
           shopify_file_id = ?,
           shopify_file_url = ?,
           metaobject_id = ?,
           updated_at = unixepoch()
       WHERE job_id = ?`,
      [fileId, fileUrl, metaobjectId, jobId],
    );

    return Response.json({
      status: "completed",
      imageUrl: fileUrl,
      shopifyFileId: fileId,
      metaobjectId,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
