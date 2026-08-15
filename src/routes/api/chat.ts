import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `You are ORVEX Copilot, an in-app AI assistant for the ORVEX DEX on the LitVM LiteForge testnet (chain id 4441, native token zkLTC, wrapped wzkLTC).
- Explain how to use ORVEX features: Swap, Liquidity, Pools, Farms, Faucet, Domains (.orvex), Portfolio, AI Trading Hub, Analytics.
- You have live on-chain tools. ALWAYS call a tool before stating any price, reserve, TVL, route or pool number — never guess or reuse old numbers.
- Tools: getProtocolStats (TVL + pool count), getPools (all pools with reserves/TVL), getTokenPrice, getPool (one pair), quoteSwap (best route + output).
- After a tool result, summarise it in markdown and finish with a concrete action link, e.g. "[Swap ORVX → wzkLTC](/swap?from=ORVX&to=wzkLTC)" or "[Add liquidity](/liquidity?from=ORVX&to=wzkLTC)".
- If the user shares a portfolio summary, use it to give rebalance advice referencing their actual holdings and P&L.
- Be concise, use markdown, prefer step-by-step lists for actions.
- If asked about private keys, seed phrases, or admin secrets, refuse and remind the user ORVEX never asks for them.
- All numbers are testnet values denominated in wzkLTC. This is educational information, not financial advice.`;

type ChatRequestBody = { messages?: unknown; portfolio?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, portfolio } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        try {
          const onchain = await import("@/lib/onchain.server");
          const gateway = createLovableAiGatewayProvider(key);

          const tools = {
            getProtocolStats: tool({
              description: "Live ORVEX protocol stats: total TVL in wzkLTC, pool count, top pools.",
              inputSchema: z.object({}),
              execute: async () => onchain.getProtocolStats(),
            }),
            getPools: tool({
              description: "List all ORVEX liquidity pools with reserves and TVL, sorted by TVL.",
              inputSchema: z.object({
                limit: z.number().nullable().describe("Max pools to return, default 10"),
              }),
              execute: async ({ limit }) => {
                const pools = await onchain.loadPools();
                return pools.slice(0, Math.min(Math.max(limit ?? 10, 1), 25)).map((p) => ({
                  pair: `${p.symbol0}/${p.symbol1}`,
                  reserves: `${p.reserve0} ${p.symbol0} / ${p.reserve1} ${p.symbol1}`,
                  tvlWzk: p.tvlWzk.toFixed(4),
                }));
              },
            }),
            getTokenPrice: tool({
              description: "Price of a token denominated in wzkLTC, read from live pool reserves.",
              inputSchema: z.object({ token: z.string().describe("Symbol or 0x address") }),
              execute: async ({ token }) => onchain.getTokenPrice(token),
            }),
            getPool: tool({
              description: "Reserves, price and TVL of one pool for a token pair.",
              inputSchema: z.object({ tokenA: z.string(), tokenB: z.string() }),
              execute: async ({ tokenA, tokenB }) => onchain.getPool(tokenA, tokenB),
            }),
            quoteSwap: tool({
              description:
                "Best swap route and expected output for an amount, using the ORVEX router getAmountsOut.",
              inputSchema: z.object({
                from: z.string(),
                to: z.string(),
                amount: z.string().describe("Human amount of the from-token, e.g. '10'"),
              }),
              execute: async ({ from, to, amount }) => onchain.quoteSwap(from, to, amount),
            }),
          };

          const portfolioNote =
            portfolio && typeof portfolio === "string" && portfolio.trim()
              ? `\n\nConnected wallet portfolio snapshot (from live on-chain reads):\n${portfolio.slice(0, 2000)}`
              : "";

          const result = streamText({
            model: gateway("openai/gpt-5.6-sol"),
            system: SYSTEM_PROMPT + portfolioNote,
            messages: await convertToModelMessages(messages as UIMessage[]),
            tools,
            stopWhen: stepCountIs(50),
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
