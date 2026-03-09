/**
 * Shopify Admin API helpers.
 * Uses offline session access tokens to make GraphQL calls.
 * Handles: customer credits (metafields), file uploads, metaobjects.
 */

import { getDb, getFirstRow } from "../db.server";

const API_VERSION = "2026-04";

// ---------------------------------------------------------------------------
// GraphQL client
// ---------------------------------------------------------------------------

async function shopifyGraphQL<T = any>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify GraphQL error (${response.status}): ${text}`);
  }

  const json = (await response.json()) as { data: T; errors?: any[] };

  if (json.errors?.length) {
    throw new Error(
      `Shopify GraphQL errors: ${JSON.stringify(json.errors)}`,
    );
  }

  return json.data;
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export interface OfflineSession {
  shop: string;
  accessToken: string;
}

/**
 * Get the offline (permanent) access token for a shop.
 */
export async function getOfflineSession(
  shop: string,
): Promise<OfflineSession> {
  const db = getDb();
  const row = await getFirstRow(
    db,
    "SELECT shop, accessToken FROM sessions WHERE shop = ? AND isOnline = 0 LIMIT 1",
    [shop],
  );

  if (!row || !row.accessToken) {
    throw new Error(`No offline session found for shop: ${shop}`);
  }

  return {
    shop: row.shop as string,
    accessToken: row.accessToken as string,
  };
}

// ---------------------------------------------------------------------------
// Customer credits (metafield: tattup.credits)
// ---------------------------------------------------------------------------

const CREDITS_NAMESPACE = "tattup";
const CREDITS_KEY = "credits";

export async function getCustomerCredits(
  shop: string,
  accessToken: string,
  customerId: string,
): Promise<number> {
  const data = await shopifyGraphQL(shop, accessToken, `
    query getCredits($customerId: ID!) {
      customer(id: $customerId) {
        metafield(namespace: "${CREDITS_NAMESPACE}", key: "${CREDITS_KEY}") {
          value
        }
      }
    }
  `, { customerId });

  const value = data?.customer?.metafield?.value;
  return value ? parseInt(value, 10) : 0;
}

export async function setCustomerCredits(
  shop: string,
  accessToken: string,
  customerId: string,
  credits: number,
): Promise<void> {
  const data = await shopifyGraphQL(shop, accessToken, `
    mutation setCredits($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id value }
        userErrors { field message }
      }
    }
  `, {
    metafields: [{
      ownerId: customerId,
      namespace: CREDITS_NAMESPACE,
      key: CREDITS_KEY,
      type: "number_integer",
      value: String(credits),
    }],
  });

  const errors = data?.metafieldsSet?.userErrors;
  if (errors?.length) {
    throw new Error(`Failed to set credits: ${JSON.stringify(errors)}`);
  }
}

/**
 * Check if a customer has been welcomed (received free credit).
 */
export async function hasCustomerBeenWelcomed(
  shop: string,
  accessToken: string,
  customerId: string,
): Promise<boolean> {
  const data = await shopifyGraphQL(shop, accessToken, `
    query getWelcomed($customerId: ID!) {
      customer(id: $customerId) {
        metafield(namespace: "${CREDITS_NAMESPACE}", key: "welcomed") {
          value
        }
      }
    }
  `, { customerId });

  return data?.customer?.metafield?.value === "true";
}

/**
 * Mark a customer as welcomed (received free credit).
 */
export async function setCustomerWelcomed(
  shop: string,
  accessToken: string,
  customerId: string,
): Promise<void> {
  await shopifyGraphQL(shop, accessToken, `
    mutation setWelcomed($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }
  `, {
    metafields: [{
      ownerId: customerId,
      namespace: CREDITS_NAMESPACE,
      key: "welcomed",
      type: "boolean",
      value: "true",
    }],
  });
}

/**
 * Add credits to a customer (atomic: read current + add).
 */
export async function addCustomerCredits(
  shop: string,
  accessToken: string,
  customerId: string,
  amount: number,
): Promise<number> {
  const current = await getCustomerCredits(shop, accessToken, customerId);
  const newTotal = current + amount;
  await setCustomerCredits(shop, accessToken, customerId, newTotal);
  return newTotal;
}

// ---------------------------------------------------------------------------
// Shopify Files upload
// ---------------------------------------------------------------------------

interface StagedTarget {
  url: string;
  resourceUrl: string;
  parameters: { name: string; value: string }[];
}

/**
 * Upload an image (from URL) to Shopify Files.
 * Returns the Shopify file GID and the public CDN URL.
 */
export async function uploadImageToShopifyFiles(
  shop: string,
  accessToken: string,
  sourceImageUrl: string,
  filename: string,
  altText: string,
): Promise<{ fileId: string; fileUrl: string }> {
  // Step 1: Create staged upload target
  const stagedData = await shopifyGraphQL(shop, accessToken, `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `, {
    input: [{
      resource: "FILE",
      filename,
      mimeType: "image/png",
      httpMethod: "POST",
    }],
  });

  const targets = stagedData?.stagedUploadsCreate?.stagedTargets;
  if (!targets?.length) {
    const errors = stagedData?.stagedUploadsCreate?.userErrors;
    throw new Error(
      `Failed to create staged upload: ${JSON.stringify(errors)}`,
    );
  }

  const target: StagedTarget = targets[0];

  // Step 2: Download image from AI backend
  const imageResponse = await fetch(sourceImageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status}`);
  }
  const imageBlob = await imageResponse.blob();

  // Step 3: Upload to staged target (multipart form)
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append("file", imageBlob, filename);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Staged upload failed (${uploadResponse.status}): ${text}`);
  }

  // Step 4: Create file in Shopify pointing to staged upload
  const fileData = await shopifyGraphQL(shop, accessToken, `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          alt
          createdAt
          fileStatus
          preview {
            image { url }
          }
        }
        userErrors { field message }
      }
    }
  `, {
    files: [{
      originalSource: target.resourceUrl,
      alt: altText,
      contentType: "IMAGE",
    }],
  });

  const files = fileData?.fileCreate?.files;
  const fileErrors = fileData?.fileCreate?.userErrors;

  if (fileErrors?.length) {
    throw new Error(`File create failed: ${JSON.stringify(fileErrors)}`);
  }

  if (!files?.length) {
    throw new Error("File create returned no files");
  }

  const file = files[0];
  const fileUrl = file.preview?.image?.url || target.resourceUrl;

  return { fileId: file.id, fileUrl };
}

// ---------------------------------------------------------------------------
// Metaobjects (tattup_generation) - tattoo gallery per customer
// ---------------------------------------------------------------------------

const METAOBJECT_TYPE = "tattup_generation";

export async function createTattooMetaobject(
  shop: string,
  accessToken: string,
  data: {
    prompt: string;
    shopifyFileId: string;
    customerId: string;
    jobId: string;
  },
): Promise<string> {
  const result = await shopifyGraphQL(shop, accessToken, `
    mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id handle }
        userErrors { field message }
      }
    }
  `, {
    metaobject: {
      type: METAOBJECT_TYPE,
      handle: `tattup-${data.jobId}`,
      fields: [
        { key: "prompt", value: data.prompt },
        { key: "image", value: data.shopifyFileId },
        { key: "customer_id", value: data.customerId },
        { key: "created_at", value: new Date().toISOString() },
      ],
    },
  });

  const errors = result?.metaobjectCreate?.userErrors;
  if (errors?.length) {
    throw new Error(`Metaobject create failed: ${JSON.stringify(errors)}`);
  }

  return result?.metaobjectCreate?.metaobject?.id;
}

export async function getCustomerTattoos(
  shop: string,
  accessToken: string,
  customerId: string,
): Promise<
  Array<{
    id: string;
    prompt: string;
    imageUrl: string;
    createdAt: string;
  }>
> {
  const data = await shopifyGraphQL(shop, accessToken, `
    query getTattoos($query: String!) {
      metaobjects(type: "${METAOBJECT_TYPE}", first: 50, query: $query) {
        edges {
          node {
            id
            handle
            fields {
              key
              value
              reference {
                ... on MediaImage {
                  image { url }
                }
              }
            }
          }
        }
      }
    }
  `, {
    query: `fields.customer_id:${customerId}`,
  });

  const edges = data?.metaobjects?.edges || [];

  return edges.map((edge: any) => {
    const fields = edge.node.fields;
    const getField = (key: string) =>
      fields.find((f: any) => f.key === key);

    const imageField = getField("image");
    const imageUrl = imageField?.reference?.image?.url || "";

    return {
      id: edge.node.id,
      prompt: getField("prompt")?.value || "",
      imageUrl,
      createdAt: getField("created_at")?.value || "",
    };
  });
}
