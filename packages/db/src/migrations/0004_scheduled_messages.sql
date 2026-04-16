DO $$ BEGIN
  CREATE TYPE "scheduled_message_status" AS ENUM ('pending','sent','canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "scheduled_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "sender_id" uuid NOT NULL REFERENCES "users"("id"),
  "recipient_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "condition" varchar(32) NOT NULL,
  "status" scheduled_message_status NOT NULL DEFAULT 'pending',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "sent_at" timestamp
);
CREATE INDEX IF NOT EXISTS "scheduled_messages_recipient_status_idx"
  ON "scheduled_messages" ("recipient_id", "status");
