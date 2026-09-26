-- WooCommerce stores: kết nối cửa hàng qua Consumer Key/Secret (API key, không OAuth).
-- Key/secret lưu mã hóa (TOKEN_ENCRYPTION_KEY) ở cột encrypted*.
CREATE TABLE "woo_stores" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storeUrl" TEXT NOT NULL,
    "storeName" TEXT,
    "currency" TEXT,
    "wcVersion" TEXT,
    "encryptedConsumerKey" TEXT NOT NULL,
    "encryptedConsumerSecret" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastError" TEXT,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "woo_stores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "woo_stores_workspaceId_storeUrl_key" ON "woo_stores"("workspaceId", "storeUrl");
CREATE INDEX "woo_stores_workspaceId_idx" ON "woo_stores"("workspaceId");

ALTER TABLE "woo_stores" ADD CONSTRAINT "woo_stores_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
