import { AgentRequest, AgentResponse } from "@/app/types/api";
import { NextResponse } from "next/server";
import { createAgent } from "./create-agent";
import { Message, generateId, generateText } from "ai";

const messages: Message[] = [];

const extractTextFromMessage = (message: Message): string => {
  const parts = message.content ?? [];
  const chunks: string[] = [];

  for (const part of parts as Array<Record<string, unknown>>) {
    if (part.type === "text" && typeof part.text === "string") {
      const value = part.text.trim();
      if (value) {
        chunks.push(value);
      }
      continue;
    }

    if ("result" in part && part.result != null) {
      if (typeof part.result === "string") {
        chunks.push(part.result);
      } else {
        try {
          chunks.push(JSON.stringify(part.result));
        } catch (error) {
          console.warn("Unable to stringify tool result", error);
        }
      }
    }
  }

  return chunks.join("\n").trim();
};

const findLatestMessageText = (
  allMessages: Message[],
  roles: Message["role"][],
): string | undefined => {
  for (const message of allMessages) {
    if (!roles.includes(message.role)) {
      continue;
    }

    const text = extractTextFromMessage(message);
    if (text) {
      return text;
    }
  }

  return undefined;
};

/**
 * Handles incoming POST requests to interact with the AgentKit-powered AI agent.
 * This function processes user messages and streams responses from the agent.
 */
export async function POST(
  req: Request & { json: () => Promise<AgentRequest> },
): Promise<NextResponse<AgentResponse>> {
  try {
    const { userMessage } = await req.json();
    const agent = await createAgent();

    messages.push({ id: generateId(), role: "user", content: userMessage });
    const res = await generateText({
      model: agent.model,
      tools: agent.tools,
      system: agent.system,
      messages,
      maxSteps: 10,
    });

    const reversedMessages = [...res.response.messages].reverse();

    const responseText =
      (typeof res.text === "string" ? res.text.trim() : "") ||
      findLatestMessageText(reversedMessages, ["assistant"]) ||
      findLatestMessageText(reversedMessages, ["tool"]) ||
      "";

    if (responseText) {
      messages.push({ id: generateId(), role: "assistant", content: responseText });
    }

    return NextResponse.json({ response: responseText });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json({
      error:
        error instanceof Error
          ? error.message
          : "I'm sorry, I encountered an issue processing your message. Please try again later.",
    });
  }
}
