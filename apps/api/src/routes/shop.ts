import { Router } from "express";
import { getAuth, requireAuth } from "../middleware/require-auth.js";
import { getWebChatSettings } from "../services/shop.js";

export const shopRouter = Router();

shopRouter.use(requireAuth);

shopRouter.get("/web-chat", async (_req, res) => {
  const { shopId } = getAuth(res);
  res.json(await getWebChatSettings(shopId));
});
