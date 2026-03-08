/**
 * Client for Timo's AI tattoo generation backend.
 * Base URL and auth token come from environment variables.
 */

export interface TimoGenerateResponse {
  jobId: string;
}

export interface TimoStatusResponse {
  status: "pending" | "processing" | "completed" | "failed";
  result_url?: string;
}

/**
 * Start a new tattoo generation job.
 * POST /generate → { jobId }
 */
export async function startGeneration(
  baseUrl: string,
  authToken: string,
  prompt: string,
  shopId: string,
): Promise<TimoGenerateResponse> {
  const response = await fetch(`${baseUrl}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ prompt, shopId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Timo API generate failed (${response.status}): ${text}`,
    );
  }

  return response.json() as Promise<TimoGenerateResponse>;
}

/**
 * Check the status of a generation job.
 * GET /status/:jobId → { status, result_url? }
 */
export async function checkGenerationStatus(
  baseUrl: string,
  authToken: string,
  jobId: string,
): Promise<TimoStatusResponse> {
  const response = await fetch(`${baseUrl}/status/${jobId}`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Timo API status failed (${response.status}): ${text}`,
    );
  }

  return response.json() as Promise<TimoStatusResponse>;
}
