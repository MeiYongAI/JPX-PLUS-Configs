CREATE TABLE IF NOT EXISTS download_totals (
  config_id INTEGER PRIMARY KEY CHECK(config_id > 0),
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0)
);
CREATE TABLE IF NOT EXISTS download_receipts (
  day TEXT NOT NULL,
  config_id INTEGER NOT NULL CHECK(config_id > 0),
  visitor TEXT NOT NULL CHECK(length(visitor) = 64),
  PRIMARY KEY (day, config_id, visitor)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS increment_download_total
AFTER INSERT ON download_receipts
BEGIN
  INSERT INTO download_totals(config_id, count) VALUES(NEW.config_id, 1)
  ON CONFLICT(config_id) DO UPDATE SET count = count + 1;
END;
