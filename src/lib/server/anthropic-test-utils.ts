import type Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { vi } from "vitest";

/** A BetaMessage with the given content blocks, for mocking the SDK in tests. */
export function fakeMessage(
  content: Array<Record<string, unknown>>,
  overrides: Partial<Record<keyof BetaMessage, unknown>> = {},
): BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  } as unknown as BetaMessage;
}

export const textMessage = (text: string, overrides?: Parameters<typeof fakeMessage>[1]) =>
  fakeMessage([{ type: "text", text, citations: null }], overrides);

/** A client whose beta.messages.create returns the given messages in order. */
export function fakeClient(...messages: BetaMessage[]) {
  const create = vi.fn();
  for (const m of messages) create.mockResolvedValueOnce(m);
  const client = { beta: { messages: { create } } } as unknown as Anthropic;
  return { client, create };
}
