-- 0004 added onboarding_status with default 'pending_connect', which also landed on
-- the operator-created tenants that were already live. Those tenants never go through
-- self-serve onboarding, so mark them 'active'. Self-serve tenants are excluded: they
-- are either still inactive drafts (active = false) or have a Stripe subscription.
UPDATE "tenant" SET "onboarding_status" = 'active'
WHERE "active" = true AND "stripe_subscription_id" IS NULL;
