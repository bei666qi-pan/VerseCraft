-- Legacy exploration-rank data lived only in game_records.
-- Settlement history remains in settlement_histories and is the new history source.
DROP TABLE IF EXISTS "game_records";
