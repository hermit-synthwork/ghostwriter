CREATE TYPE "public"."onboarding_status" AS ENUM('pending_connect', 'pending_payment', 'active', 'payment_failed', 'canceled');--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "onboarding_status" "onboarding_status" DEFAULT 'pending_connect' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "zernio_profile_id" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "stripe_subscription_status" text;--> statement-breakpoint
CREATE INDEX "tenant_stripe_subscription_idx" ON "tenant" USING btree ("stripe_subscription_id");