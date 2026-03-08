-- Minimal job tracking for generation requests.
-- Maps AI backend jobId to Shopify context needed on completion.
CREATE TABLE IF NOT EXISTS generations (
  job_id TEXT PRIMARY KEY,
  shop TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'pending',
  image_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_generations_customer ON generations(customer_id, shop);
