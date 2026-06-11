-- Brand website + free-text about/knowledge the agent may share/speak from.
-- Additive, safe to apply online.
ALTER TABLE "brand_profile" ADD COLUMN "website" TEXT NOT NULL DEFAULT '';
ALTER TABLE "brand_profile" ADD COLUMN "about" TEXT NOT NULL DEFAULT '';
