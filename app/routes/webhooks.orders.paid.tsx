/**
 * Webhook: orders/paid
 *
 * When a customer purchases the credit-packages product,
 * parse the variant title to determine credits and add them to the customer.
 *
 * Variant title formats from the product:
 *   "20 Credits - Einmalkauf"   → 20 credits (one-time)
 *   "25 Credits/Monat - Abo"    → 25 credits (subscription)
 * The number at the start is parsed as the credit amount.
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getOfflineSession,
  addCustomerCredits,
} from "../services/shopify-admin.server";

// The product ID for credit packages (numeric, not GID)
const CREDIT_PRODUCT_ID = "15530387669322";

// Fallback: map variant titles to credit amounts
// This handles both one-time and subscription variants
function parseCreditsFromTitle(title: string): number {
  // Match patterns like "20 Credits - Einmalkauf", "25 Credits/Monat - Abo", etc.
  const match = title.match(/(\d+)\s*Credits?/i);
  return match ? parseInt(match[1], 10) : 0;
}

export async function action({ request }: ActionFunctionArgs) {
  const { payload, shop } = await authenticate.webhook(request);

  const order = payload as {
    customer?: { id: number };
    line_items?: Array<{
      product_id: number;
      variant_title: string;
      title: string;
      quantity: number;
    }>;
  };

  if (!order.customer?.id || !order.line_items?.length) {
    return new Response("OK", { status: 200 });
  }

  const customerId = `gid://shopify/Customer/${order.customer.id}`;

  // Find credit package line items
  let totalCredits = 0;
  for (const item of order.line_items) {
    if (String(item.product_id) === CREDIT_PRODUCT_ID) {
      const credits = parseCreditsFromTitle(
        item.variant_title || item.title || "",
      );
      totalCredits += credits * item.quantity;
    }
  }

  if (totalCredits > 0) {
    try {
      const session = await getOfflineSession(shop);
      const newBalance = await addCustomerCredits(
        session.shop,
        session.accessToken,
        customerId,
        totalCredits,
      );
      console.log(
        `Granted ${totalCredits} credits to customer ${customerId}. New balance: ${newBalance}`,
      );
    } catch (error) {
      console.error("Failed to grant credits:", error);
      // Return 500 so Shopify retries the webhook
      return new Response("Credit grant failed", { status: 500 });
    }
  }

  return new Response("OK", { status: 200 });
}
