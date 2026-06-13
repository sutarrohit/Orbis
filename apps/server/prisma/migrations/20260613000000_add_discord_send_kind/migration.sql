-- CreateEnum
CREATE TYPE "SendKind" AS ENUM ('dm', 'channel_post');

-- AlterTable: PendingSend gains a send kind + channel target, and leadId becomes
-- optional (channel posts aren't tied to a lead).
ALTER TABLE "pending_send"
  ADD COLUMN     "kind" "SendKind" NOT NULL DEFAULT 'dm',
  ADD COLUMN     "targetId" TEXT,
  ALTER COLUMN   "leadId" DROP NOT NULL;
