ALTER TYPE "public"."genre" ADD VALUE IF NOT EXISTS 'drama';--> statement-breakpoint
ALTER TYPE "public"."genres" ADD VALUE IF NOT EXISTS 'drama_funny';--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "episode_number" integer;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "series_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "episode_tenant_number_uq" ON "episode" USING btree ("tenant_id","episode_number") WHERE "episode"."status" not in ('failed', 'rejected');