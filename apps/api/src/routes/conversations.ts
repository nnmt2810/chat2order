import { Router } from "express";
import {
  conversationListQuerySchema,
  linkCustomerSchema,
  messageListQuerySchema,
  replyMessageSchema,
} from "@chat2order/shared/conversation";
import { customerInputSchema } from "@chat2order/shared/customer";
import { getAuth, requireAuth } from "../middleware/require-auth.js";
import {
  createCustomerFromConversation,
  getConversation,
  linkConversationCustomer,
  listConversations,
  listMessages,
  markConversationRead,
  replyToConversation,
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

conversationsRouter.post("/:id/messages", async (req, res) => {
  const { text } = replyMessageSchema.parse(req.body);
  const { shopId, userId } = getAuth(res);
  res.status(201).json({ message: await replyToConversation(shopId, userId, req.params.id, text) });
});

conversationsRouter.post("/:id/read", async (req, res) => {
  const { shopId } = getAuth(res);
  await markConversationRead(shopId, req.params.id);
  res.status(204).end();
});

conversationsRouter.patch("/:id", async (req, res) => {
  const { customerId } = linkCustomerSchema.parse(req.body);
  const { shopId } = getAuth(res);
  res.json({ conversation: await linkConversationCustomer(shopId, req.params.id, customerId) });
});

conversationsRouter.post("/:id/customer", async (req, res) => {
  const input = customerInputSchema.parse(req.body);
  const { shopId } = getAuth(res);
  res
    .status(201)
    .json({ conversation: await createCustomerFromConversation(shopId, req.params.id, input) });
});
