-- Auto matter numbers: unique per firm when set (NULLs allowed for legacy rows).

-- Resolve any legacy duplicate free-text matter numbers before enforcing uniqueness.
WITH dups AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY firm_id, matter_number
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM matters
  WHERE matter_number IS NOT NULL
)
UPDATE matters AS m
SET matter_number = m.matter_number || '-dup' || d.rn::text
FROM dups AS d
WHERE m.id = d.id
  AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "matters_firm_matter_number_uid"
  ON "matters" ("firm_id", "matter_number");
