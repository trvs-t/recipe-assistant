-- Migration: Add source_text column to recipes table
-- Purpose: Store original text input for text-mode recipe imports

-- Add source_text column as nullable (URL imports will have NULL source_text)
ALTER TABLE recipes ADD COLUMN source_text TEXT;

-- Add column comment explaining purpose
COMMENT ON COLUMN recipes.source_text IS 'Original text input for text-mode imports';
