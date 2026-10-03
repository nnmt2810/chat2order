import { Router } from "express";
import {
  productInputSchema,
  productListQuerySchema,
  productUpdateSchema,
} from "@chat2order/shared/product";
import { getAuth, requireAuth } from "../middleware/require-auth.js";
import {
  archiveProduct,
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "../services/products.js";

export const productsRouter = Router();

productsRouter.use(requireAuth);

productsRouter.get("/", async (req, res) => {
  const query = productListQuerySchema.parse(req.query);
  const { shopId } = getAuth(res);
  res.json(await listProducts(shopId, query));
});

productsRouter.get("/:id", async (req, res) => {
  const { shopId } = getAuth(res);
  res.json({ product: await getProduct(shopId, req.params.id) });
});

productsRouter.post("/", async (req, res) => {
  const input = productInputSchema.parse(req.body);
  const { shopId } = getAuth(res);
  res.status(201).json({ product: await createProduct(shopId, input) });
});

productsRouter.patch("/:id", async (req, res) => {
  const input = productUpdateSchema.parse(req.body);
  const { shopId } = getAuth(res);
  res.json({ product: await updateProduct(shopId, req.params.id, input) });
});

productsRouter.delete("/:id", async (req, res) => {
  const { shopId } = getAuth(res);
  await archiveProduct(shopId, req.params.id);
  res.status(204).end();
});
