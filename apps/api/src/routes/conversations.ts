import { Router } from "express";
import {
  conversationListQuerySchema,
  messageListQuerySchema,
} from "@chat2order/shared/conversation";
import { getAuth, requireAuth } from "../middleware/require-auth.js";
import {
  getConversation,
  listConversations,
  listMessages,
  markConversationRead,
} from "../services/conversations.js";

export const conversationsRouter = Router();

conversationsRouter.use(requireAuth);

conversationsRouter.get("/", async (req, res) => {
  const query = conversationListQuerySchema.parse(req.query);
  const { shopId } = getAuth(res);
  res.json(await listConversations(shopId, query));
});

conversationsRouter.get("/:id", async (req, res) => {
  const { shopId } = getAuth(res);
  res.json({ conversation: await getConversation(shopId, req.params.id) });
});

conversationsRouter.get("/:id/messages", async (req, res) => {
  const query = messageListQuerySchema.parse(req.query);
  const { shopId } = getAuth(res);
  res.json(await listMessages(shopId, req.params.id, query));
});

conversationsRouter.post("/:id/read", async (req, res) => {
  const { shopId } = getAuth(res);
  await markConversationRead(shopId, req.params.id);
  res.status(204).end();
});
