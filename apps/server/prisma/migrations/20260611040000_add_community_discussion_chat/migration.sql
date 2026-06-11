-- For broadcast channels: the linked discussion group's chat id (members are
-- stored under this id, not groupChatId). Additive, safe to apply online.
ALTER TABLE "community" ADD COLUMN "discussionChatId" TEXT NOT NULL DEFAULT '';
