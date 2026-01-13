-- CreateTable
CREATE TABLE "BotFillCursor" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "tradedNotionalToday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastTradeId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotFillCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotFillSeen" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotFillSeen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotOrderMap" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotOrderMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotFillCursor_botId_symbol_dayKey_key" ON "BotFillCursor"("botId", "symbol", "dayKey");

-- CreateIndex
CREATE INDEX "BotFillCursor_botId_symbol_dayKey_idx" ON "BotFillCursor"("botId", "symbol", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "BotFillSeen_botId_symbol_tradeId_key" ON "BotFillSeen"("botId", "symbol", "tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "BotOrderMap_botId_symbol_orderId_key" ON "BotOrderMap"("botId", "symbol", "orderId");

-- CreateIndex
CREATE INDEX "BotOrderMap_botId_symbol_clientOrderId_idx" ON "BotOrderMap"("botId", "symbol", "clientOrderId");
