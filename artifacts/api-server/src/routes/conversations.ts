import { Router } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.bankofai.io/v1",
});

// GET /conversations
router.get("/", async (req, res) => {
  try {
    const conversations = await db
      .select({
        id: conversationsTable.id,
        title: conversationsTable.title,
        createdAt: conversationsTable.createdAt,
        updatedAt: conversationsTable.updatedAt,
        messageCount: count(messagesTable.id),
        lastMessage: sql<string | null>`(
          SELECT content FROM messages
          WHERE conversation_id = ${conversationsTable.id}
          ORDER BY created_at DESC
          LIMIT 1
        )`,
      })
      .from(conversationsTable)
      .leftJoin(messagesTable, eq(messagesTable.conversationId, conversationsTable.id))
      .groupBy(conversationsTable.id)
      .orderBy(desc(conversationsTable.updatedAt));

    res.json(conversations);
  } catch (err) {
    req.log.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /conversations
router.post("/", async (req, res) => {
  try {
    const { title } = req.body as { title: string };
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const [conv] = await db
      .insert(conversationsTable)
      .values({ title: title.trim() })
      .returning();
    res.status(201).json({ ...conv, messageCount: 0, lastMessage: null });
  } catch (err) {
    req.log.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /conversations/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const [conv] = await db
      .select({
        id: conversationsTable.id,
        title: conversationsTable.title,
        createdAt: conversationsTable.createdAt,
        updatedAt: conversationsTable.updatedAt,
        messageCount: count(messagesTable.id),
        lastMessage: sql<string | null>`(
          SELECT content FROM messages
          WHERE conversation_id = ${conversationsTable.id}
          ORDER BY created_at DESC
          LIMIT 1
        )`,
      })
      .from(conversationsTable)
      .leftJoin(messagesTable, eq(messagesTable.conversationId, conversationsTable.id))
      .where(eq(conversationsTable.id, id))
      .groupBy(conversationsTable.id);

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json(conv);
  } catch (err) {
    req.log.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /conversations/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(conversationsTable).where(eq(conversationsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /conversations/:id/messages
router.get("/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id));

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(messagesTable.createdAt);

    res.json(msgs);
  } catch (err) {
    req.log.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /conversations/:id/messages — SSE streaming chat
router.post("/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  const { content } = req.body as { content: string };

  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "content is required" });
    return;
  }

  try {
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id));

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Save user message
    await db.insert(messagesTable).values({
      conversationId: id,
      role: "user",
      content: content.trim(),
    });

    // Load history for context
    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(messagesTable.createdAt);

    const chatMessages = history.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let fullResponse = "";

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 4096,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful, thoughtful AI assistant. Be concise but thorough. Use markdown formatting when helpful.",
        },
        ...chatMessages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        fullResponse += token;
        res.write(`data: ${JSON.stringify({ content: token })}\n\n`);
      }
    }

    // Save assistant message
    await db.insert(messagesTable).values({
      conversationId: id,
      role: "assistant",
      content: fullResponse,
    });

    // Update conversation updatedAt
    await db
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(conversationsTable.id, id));

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to send message");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`);
      res.end();
    }
  }
});

export default router;
