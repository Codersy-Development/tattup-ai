/**
 * App Proxy request helpers.
 *
 * When requests come through Shopify App Proxy, Shopify appends query params:
 *   shop, logged_in_customer_id, path_prefix, timestamp, signature
 *
 * This module extracts those and provides the customer GID.
 */

export interface AppProxyContext {
  shop: string;
  customerId: string; // GID format: gid://shopify/Customer/123
  customerNumericId: string; // Just the number: "123"
}

/**
 * Extract shop + customer from an App Proxy request.
 * Falls back to body/query params for direct API calls during development.
 */
export function getAppProxyContext(
  request: Request,
  body?: Record<string, any>,
): AppProxyContext {
  const url = new URL(request.url);

  // App Proxy params (production - added by Shopify)
  const shop = url.searchParams.get("shop");
  const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");

  if (shop && loggedInCustomerId) {
    return {
      shop,
      customerId: `gid://shopify/Customer/${loggedInCustomerId}`,
      customerNumericId: loggedInCustomerId,
    };
  }

  // Direct call fallback (development / testing)
  const directShop = body?.shop || url.searchParams.get("shop_override");
  const directCustomerId =
    body?.customerId || url.searchParams.get("customerId");

  if (!directShop || !directCustomerId) {
    throw new Error(
      "Missing shop or customer context. Ensure request comes through App Proxy or provide shop + customerId.",
    );
  }

  // Normalize customerId to GID format
  const isGid = directCustomerId.startsWith("gid://");
  const numericId = isGid
    ? directCustomerId.split("/").pop()!
    : directCustomerId;
  const gid = isGid
    ? directCustomerId
    : `gid://shopify/Customer/${directCustomerId}`;

  return {
    shop: directShop,
    customerId: gid,
    customerNumericId: numericId,
  };
}
