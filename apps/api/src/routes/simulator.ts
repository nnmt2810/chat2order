import { Router } from "express";
import { simulatedMessageSchema } from "@chat2order/shared/conversation";
import { getAuth, requireAuth } from "../middleware/require-auth.js";
import { simulateInboundMessage } from "../services/conversations.js";

export const simulatorRouter = Router();

simulatorRouter.use(requireAuth);

simulatorRouter.post("/messages", async (req, res) => {
  const input = simulatedMessageSchema.parse(req.body);
  const { shopId } = getAuth(res);
  res.status(201).json(await simulateInboundMessage(shopId, input));
});
