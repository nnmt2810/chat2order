import { Router } from "express";
import {
  customerInputSchema,
  customerListQuerySchema,
  customerUpdateSchema,
} from "@chat2order/shared/customer";
import { getAuth, requireAuth } from "../middleware/require-auth.js";
import {
  archiveCustomer,
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../services/customers.js";

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", async (req, res) => {
  const query = customerListQuerySchema.parse(req.query);
  const { shopId } = getAuth(res);
  res.json(await listCustomers(shopId, query));
});

customersRouter.get("/:id", async (req, res) => {
  const { shopId } = getAuth(res);
  res.json({ customer: await getCustomer(shopId, req.params.id) });
});

customersRouter.post("/", async (req, res) => {
  const input = customerInputSchema.parse(req.body);
  const { shopId } = getAuth(res);
  res.status(201).json({ customer: await createCustomer(shopId, input) });
});

customersRouter.patch("/:id", async (req, res) => {
  const input = customerUpdateSchema.parse(req.body);
  const { shopId } = getAuth(res);
  res.json({ customer: await updateCustomer(shopId, req.params.id, input) });
});

customersRouter.delete("/:id", async (req, res) => {
  const { shopId } = getAuth(res);
  await archiveCustomer(shopId, req.params.id);
  res.status(204).end();
});
