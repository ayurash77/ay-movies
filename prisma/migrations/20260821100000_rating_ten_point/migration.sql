BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Rating"
        WHERE "value" NOT BETWEEN 1 AND 5
    ) THEN
        RAISE EXCEPTION 'Rating values must use the legacy 1-5 scale before migration';
    END IF;
END
$$;

UPDATE "Rating"
SET "value" = "value" * 2
WHERE "value" BETWEEN 1 AND 5;

ALTER TABLE "Rating"
ADD CONSTRAINT "Rating_value_range_check"
CHECK ("value" BETWEEN 1 AND 10);

COMMIT;
