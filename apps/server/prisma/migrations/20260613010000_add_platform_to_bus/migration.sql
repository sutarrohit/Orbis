-- AlterTable: tag the bus tables with the platform they belong to so the
-- dashboard can badge Telegram vs Discord without a join.
ALTER TABLE "community" ADD COLUMN "platform" "Platform" NOT NULL DEFAULT 'telegram';
ALTER TABLE "lead" ADD COLUMN "platform" "Platform" NOT NULL DEFAULT 'telegram';
ALTER TABLE "conversation" ADD COLUMN "platform" "Platform" NOT NULL DEFAULT 'telegram';
ALTER TABLE "group_member" ADD COLUMN "platform" "Platform" NOT NULL DEFAULT 'telegram';

-- Backfill from the source of truth (the joining account / its community).
UPDATE "community" c SET "platform" = a."platform"
  FROM "social_account" a WHERE c."assignedAccountId" = a.id;

UPDATE "group_member" gm SET "platform" = c."platform"
  FROM "community" c
  WHERE gm."brandId" = c."brandId" AND gm."groupChatId" = c."groupChatId"
    AND c."groupChatId" <> '';

UPDATE "conversation" cv SET "platform" = c."platform"
  FROM "community" c
  WHERE cv."brandId" = c."brandId" AND cv."groupChatId" = c."groupChatId"
    AND c."groupChatId" <> '';

UPDATE "lead" l SET "platform" = c."platform"
  FROM "community" c
  WHERE l."brandId" = c."brandId" AND l."sourceGroupChatId" = c."groupChatId"
    AND c."groupChatId" <> '';
