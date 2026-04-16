CREATE TABLE IF NOT EXISTS "weather_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "date" date NOT NULL,
  "code" varchar(32) NOT NULL,
  "label" varchar(64) NOT NULL,
  "emoji" varchar(16) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "weather_override_user_date_unique"
  ON "weather_overrides" ("user_id", "date");
