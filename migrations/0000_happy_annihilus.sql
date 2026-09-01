CREATE TYPE "public"."autonomy" AS ENUM('autonomous', 'review_each', 'review_weekly');--> statement-breakpoint
CREATE TYPE "public"."episode_status" AS ENUM('generating', 'ready', 'approved', 'scheduled', 'posted', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."genre" AS ENUM('funny', 'horror');--> statement-breakpoint
CREATE TYPE "public"."genres" AS ENUM('funny', 'horror', 'both');--> statement-breakpoint
CREATE TYPE "public"."key_owner" AS ENUM('platform', 'tenant');--> statement-breakpoint
CREATE TYPE "public"."usage_kind" AS ENUM('image', 'story_tokens', 'post');--> statement-breakpoint
CREATE TABLE "episode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"slug" text NOT NULL,
	"genre" "genre" NOT NULL,
	"title" text NOT NULL,
	"logline" text NOT NULL,
	"story_json" jsonb NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"status" "episode_status" DEFAULT 'generating' NOT NULL,
	"blob_prefix" text NOT NULL,
	"panel_urls" jsonb,
	"scheduled_for" timestamp with time zone,
	"posts" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"posted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"tenants_due" integer DEFAULT 0 NOT NULL,
	"tenants_ok" integer DEFAULT 0 NOT NULL,
	"tenants_failed" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text,
	"display_name" text NOT NULL,
	"style_key" text NOT NULL,
	"niche" text NOT NULL,
	"genres" "genres" NOT NULL,
	"autonomy" "autonomy" NOT NULL,
	"cadence" jsonb NOT NULL,
	"publish" jsonb NOT NULL,
	"gemini_key_encrypted" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"episode_id" uuid,
	"kind" "usage_kind" NOT NULL,
	"qty" integer NOT NULL,
	"key_owner" "key_owner" NOT NULL,
	"cost_cents" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episode_tenant_created_idx" ON "episode" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "usage_tenant_created_idx" ON "usage_event" USING btree ("tenant_id","created_at");