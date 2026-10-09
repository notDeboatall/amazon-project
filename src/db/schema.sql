CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT,
  color TEXT,
  emoji TEXT
);

CREATE TABLE IF NOT EXISTS chores (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  effort INTEGER NOT NULL DEFAULT 1,
  frequency TEXT DEFAULT 'weekly',
  assignee_id INTEGER REFERENCES members(id),
  due_date TEXT,
  status TEXT DEFAULT 'open',
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS grocery_items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  quantity TEXT,
  category TEXT,
  added_by INTEGER REFERENCES members(id),
  status TEXT DEFAULT 'needed'
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  location TEXT
);

CREATE TABLE IF NOT EXISTS event_members (
  event_id INTEGER REFERENCES events(id),
  member_id INTEGER REFERENCES members(id),
  PRIMARY KEY (event_id, member_id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY,
  member_id INTEGER REFERENCES members(id),
  message TEXT NOT NULL,
  remind_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY,
  tool TEXT NOT NULL,
  args_json TEXT,
  result_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
