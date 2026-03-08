/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SCOPES: string;
  SHOP_CUSTOM_DOMAIN?: string;
  VALUE_FROM_CLOUDFLARE?: string;

  // Timo's AI backend API
  TIMO_API_BASE_URL: string;
  TIMO_API_AUTH_TOKEN: string;
}
