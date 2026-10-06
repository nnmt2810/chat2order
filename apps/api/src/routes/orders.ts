import { Router } from "express";
import {
  orderInputSchema,
  orderListQuerySchema,
  orderUpdateSchema,
} from "@chat2order/shared/order";
import { getAuth, requireAuth } from "../middleware/require-auth.js";
import { createOrder, getOrder, listOrders, updateOrder } from "../services/orders.js";

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

ordersRouter.get("/", async (req, res) => {
  const query = orderListQuerySchema.parse(req.query);
  const { shopId } = getAuth(res);
  res.json(await listOrders(shopId, query));
});

ordersRouter.get("/:id", async (req, res) => {
  const { shopId } = getAuth(res);
  res.json({ order: await getOrder(shopId, req.params.id) });
});

ordersRouter.post("/", async (req, res) => {
  const input = orderInputSchema.parse(req.body);
  const { shopId } = getAuth(res);
  res.status(201).json({ order: await createOrder(shopId, input) });
});

ordersRouter.patch("/:id", async (req, res) => {
  const input = orderUpdateSchema.parse(req.body);
  const { shopId } = getAuth(res);
  res.json({ order: await updateOrder(shopId, req.params.id, input) });
});
