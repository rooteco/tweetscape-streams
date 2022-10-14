-- CreateEnum
CREATE TYPE "ref_type" AS ENUM ('quoted', 'retweeted', 'replied_to');

-- CreateTable
CREATE TABLE "users" (
    "username" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "public_metrics_followers_count" INTEGER NOT NULL,
    "public_metrics_following_count" INTEGER NOT NULL,
    "public_metrics_tweet_count" INTEGER NOT NULL,
    "public_metrics_listed_count" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "protected" BOOLEAN NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profile_image_url" TEXT NOT NULL,
    "location" TEXT,
    "pinned_tweet_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("followerId","followingId")
);

-- CreateTable
CREATE TABLE "tokens" (
    "user_id" TEXT NOT NULL,
    "token_type" TEXT NOT NULL,
    "expires_in" INTEGER NOT NULL,
    "access_token" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "streams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tweets" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "referenced_tweets" JSONB,
    "public_metrics" JSONB NOT NULL,
    "context_annotations" JSONB,
    "entities" JSONB,
    "attachments" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL,
    "reply_settings" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "in_reply_to_user_id" TEXT,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "possibly_sensitive" BOOLEAN NOT NULL,

    CONSTRAINT "tweets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentions" (
    "tweet_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("tweet_id","user_id")
);

-- CreateTable
CREATE TABLE "refs" (
    "referenced_tweet_id" TEXT NOT NULL,
    "referencer_tweet_id" TEXT NOT NULL,
    "type" "ref_type" NOT NULL,

    CONSTRAINT "refs_pkey" PRIMARY KEY ("referenced_tweet_id","referencer_tweet_id")
);

-- CreateTable
CREATE TABLE "Post" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "_streamsTousers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_key" ON "users"("id");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_access_token_key" ON "tokens"("access_token");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_refresh_token_key" ON "tokens"("refresh_token");

-- CreateIndex
CREATE UNIQUE INDEX "streams_name_key" ON "streams"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tweets_id_key" ON "tweets"("id");

-- CreateIndex
CREATE UNIQUE INDEX "_streamsTousers_AB_unique" ON "_streamsTousers"("A", "B");

-- CreateIndex
CREATE INDEX "_streamsTousers_B_index" ON "_streamsTousers"("B");

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tweets" ADD CONSTRAINT "tweets_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "tweets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refs" ADD CONSTRAINT "refs_referenced_tweet_id_fkey" FOREIGN KEY ("referenced_tweet_id") REFERENCES "tweets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refs" ADD CONSTRAINT "refs_referencer_tweet_id_fkey" FOREIGN KEY ("referencer_tweet_id") REFERENCES "tweets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "_streamsTousers" ADD CONSTRAINT "_streamsTousers_A_fkey" FOREIGN KEY ("A") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_streamsTousers" ADD CONSTRAINT "_streamsTousers_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
