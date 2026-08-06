-- Add CHECK constraint to feedbacks.kind to enforce valid values at the database level.
-- Previously only enforced by application-level validation.
-- Idempotent: guarded by NOT EXISTS to avoid duplicate constraint errors.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedbacks_kind_check'
      AND conrelid = '"feedbacks"'::regclass
  ) THEN
    ALTER TABLE "feedbacks"
      ADD CONSTRAINT "feedbacks_kind_check"
      CHECK (kind IN ('bug', 'feature', 'content', 'other', 'open'));
  END IF;
END $$;
