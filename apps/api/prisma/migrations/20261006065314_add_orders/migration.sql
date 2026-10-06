-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SHIPPING', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "orderSeq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL DEFAULT '',
    "deliveryAddress" TEXT NOT NULL DEFAULT '',
    "deliveryDate" DATE,
    "note" TEXT NOT NULL DEFAULT '',
    "shippingFee" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_shopId_status_createdAt_idx" ON "orders"("shopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_shopId_number_key" ON "orders"("shopId", "number");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
