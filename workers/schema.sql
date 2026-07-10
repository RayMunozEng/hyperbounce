CREATE TABLE IF NOT EXISTS hyperbounce_scores (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 16),
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 100000),
    submitted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS hyperbounce_scores_ranking
ON hyperbounce_scores (score DESC, submitted_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS hyperbounce_scores_name_unique
ON hyperbounce_scores (name COLLATE NOCASE);
