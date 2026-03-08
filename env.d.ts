/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SCOPES: string;
  SHOP_CUSTOM_DOMAIN?: string;

  // AI generation backend
  API_BASE_URL: string;
  API_AUTH_TOKEN: string;
}
