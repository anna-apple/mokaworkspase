CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO schedules (id, data, version)
VALUES (1, '{"config":{"startRank":"C1","startMeter":0},"stamps":{},"streamTimes":{}}', 0);

CREATE TABLE IF NOT EXISTS admin_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    salt TEXT NOT NULL,
    hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
    ip_key TEXT PRIMARY KEY,
    window INTEGER NOT NULL,
    attempts INTEGER NOT NULL
);
