import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `You are ORVEX Copilot, an in-app AI assistant for the ORVEX DEX on the LitVM LiteForge testnet (chain id 4441, native token zkLTC).
- Explain how to use ORVEX features: Swap, Liquidity, Pools, Farms, Faucet, Domains (.orvex), Portfolio, AI Trading Hub, Analytics.
- Be concise, use markdown, and prefer step-by-step lists for actions.
- When suggesting an action, mention the exact page (e.g. /swap, /liquidity, /farm, /domains, /portfolio, /faucet, /ai).
- Never fabricate token prices, TVL, or on-chain state — direct the user to /analytics or /pools for live numbers.
- If asked about private keys, seed phrases, or admin secrets, refuse and remind the user Lovable never asks for them.`;

type ChatRequestBody = { messages?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        try {
          const gateway = createLovableAiGatewayProvider(key);
          const result = streamText({
            model: gateway("google/gemini-3-flash-preview"),
            system: SYSTEM_PROMPT,
            messages: await convertToModelMessages(messages as UIMessage[]),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "AI gateway error";
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});
