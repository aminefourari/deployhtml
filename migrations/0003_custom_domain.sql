-- Custom domains: an optional user-owned hostname mapped to a deploy. The
-- serving hot path uses KV (`host:<hostname>` -> slug); this column is the
-- source of truth for management/listing + uniqueness, like `slug`.
ALTER TABLE deploy ADD COLUMN custom_domain TEXT;
