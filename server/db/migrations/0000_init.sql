CREATE TABLE "activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"agent_id" text,
	"source" text DEFAULT 'agent' NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" text PRIMARY KEY NOT NULL,
	"book_slug" text NOT NULL,
	"kind" text NOT NULL,
	"chapter_id" text NOT NULL,
	"block_id" text NOT NULL,
	"start" integer DEFAULT 0 NOT NULL,
	"end" integer DEFAULT 0 NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'yellow' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"slug" text PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'day' NOT NULL,
	"day" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"incomplete" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'fr' NOT NULL,
	"content" jsonb NOT NULL,
	"cover" jsonb NOT NULL,
	"agents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"projects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"writer" text DEFAULT 'compiler' NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"book_slug" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"work_item_id" text NOT NULL,
	"agent_id" text,
	"note" text NOT NULL,
	"step" text,
	"resume_hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"url" text NOT NULL,
	"label" text NOT NULL,
	"agent_id" text,
	"actor" text,
	"project" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "needs" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"kind" text DEFAULT 'decision' NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"agent_id" text,
	"source" text DEFAULT 'agent' NOT NULL,
	"source_url" text,
	"deadline" timestamp with time zone,
	"blocking" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"external_key" text,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reading_state" (
	"book_slug" text PRIMARY KEY NOT NULL,
	"location" jsonb,
	"percent" integer DEFAULT 0 NOT NULL,
	"seconds_read" integer DEFAULT 0 NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"last_opened_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"day" text NOT NULL,
	"project" text,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"external_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"target" text NOT NULL,
	"status" text NOT NULL,
	"code" integer,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"project" text,
	"source" text DEFAULT 'agent' NOT NULL,
	"source_url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"previous_claim" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "annotations_book_idx" ON "annotations" USING btree ("book_slug");--> statement-breakpoint
CREATE INDEX "books_day_idx" ON "books" USING btree ("day");--> statement-breakpoint
CREATE INDEX "checkpoints_item_idx" ON "checkpoints" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "facts_day_idx" ON "facts" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "facts_source_external_idx" ON "facts" USING btree ("source","external_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "needs_external_key_idx" ON "needs" USING btree ("source","external_key");--> statement-breakpoint
CREATE INDEX "reports_day_idx" ON "reports" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_external_key_idx" ON "reports" USING btree ("agent_id","external_key");--> statement-breakpoint
CREATE INDEX "source_runs_day_idx" ON "source_runs" USING btree ("day");