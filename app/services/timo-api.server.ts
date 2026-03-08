/**
 * Client for the AI tattoo generation backend (Timo's API).
 *
 * Endpoints (from Bruno collection):
 *   POST /api/generate     → { jobId }
 *   GET  /api/status/:jobId → { status, result_url? }
 *   GET  <imageUrl>         → binary image
 */

export interface GenerateResponse {
  jobId: string;
}

export interface StatusResponse {
  status: "pending" | "processing" | "completed" | "failed";
  result_url?: string;
}

/**
 * Start a new tattoo generation.
 * POST /api/generate { prompt, shopDomain }
 */
export async function startGeneration(
  baseUrl: string,
  authToken: string,
  prompt: string,
  shopDomain: string,
): Promise<GenerateResponse> {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ prompt, shopDomain }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI generate failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<GenerateResponse>;
}

/**
 * Poll the status of a generation job.
 * GET /api/status/:jobId → { status, result_url? }
 */
export async function checkGenerationStatus(
  baseUrl: string,
  authToken: string,
  jobId: string,
): Promise<StatusResponse> {
  const response = await fetch(`${baseUrl}/api/status/${jobId}`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI status failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<StatusResponse>;
}
