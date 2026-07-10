CREATE UNIQUE INDEX IF NOT EXISTS hyperbounce_scores_name_unique
ON hyperbounce_scores (name COLLATE NOCASE);
