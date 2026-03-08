-- Tracks tattoo generation jobs
CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  shop TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  timo_image_url TEXT,
  shopify_file_id TEXT,
  shopify_file_url TEXT,
  metaobject_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_generations_job_id ON generations(job_id);
CREATE INDEX IF NOT EXISTS idx_generations_customer ON generations(customer_id, shop);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
