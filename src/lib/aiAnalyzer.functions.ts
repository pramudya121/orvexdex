import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AmountSchema = z.string().max(80).regex(/^\d+(?:\.\d{1,36})?$/);

const HoldingSchema = z.object({
  symbol: z.string().min(1).max(24).regex(/^[A-Za-z0-9._-]+$/),
  amount: AmountSchema,
  valueWzk: AmountSchema.optional(),
  share: z.number().min(0).max(1).optional(),
}).strict();

const InputSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  totalValueWzk: AmountSchema,
  holdings: z.array(HoldingSchema).max(100),
  lpCount: z.number().int().min(0).max(100_000),
  farmingCount: z.number().int().min(0).max(100_000),
  pnl: z.string().max(2_000).optional(),
}).strict();


export type AnalyzerInput = z.infer<typeof InputSchema>;

export type AnalyzerResult = {
  riskScore: number; // 0-100
  diversification: number; // 0-100
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
};

export const analyzePortfolio = createServerFn({ method: "POST" })
  .validator((data) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<AnalyzerResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are an on-chain DeFi portfolio analyst for the ORVEX DEX on LitVM LiteForge testnet (native token: zkLTC, wrapped: wzkLTC).
Analyze this wallet snapshot. All values are denominated in wzkLTC.

Wallet: ${data.address}
Total portfolio value: ${data.totalValueWzk} wzkLTC
LP positions: ${data.lpCount}
Active farming positions: ${data.farmingCount}

Holdings:
${data.holdings.map((h) => `- ${h.symbol}: ${h.amount} (${h.valueWzk ?? "?"} wzkLTC, ${((h.share ?? 0) * 100).toFixed(1)}% of portfolio)`).join("\n")}
${data.pnl ? `\nHistorical P&L (on-chain snapshots):\n${data.pnl}\n` : ""}


Return a JSON object with:
- riskScore (0-100, higher = riskier concentration/volatility)
- diversification (0-100, higher = better spread)
- summary (1-2 sentence overall assessment)
- strengths (2-3 short bullet strings)
- concerns (2-3 short bullet strings)
- recommendations (2-4 concrete actions like "Rebalance X → Y", "Provide liquidity in Z/wzkLTC", "Stake ORVX in farm")

Be concise, specific, and reference actual holdings. No preamble.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a precise DeFi analyst. Always respond with valid JSON matching the requested schema, no markdown fences." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      throw new Error(`AI analysis unavailable (${res.status})`);
    }

    const responseBody: unknown = await res.json();
    if (!responseBody || typeof responseBody !== "object" || Array.isArray(responseBody)) {
      throw new Error("AI returned an invalid response");
    }
    const choices = (responseBody as { choices?: unknown }).choices;
    const firstChoice = Array.isArray(choices) ? choices[0] : undefined;
    const message = firstChoice && typeof firstChoice === "object" && !Array.isArray(firstChoice)
      ? (firstChoice as { message?: unknown }).message
      : undefined;
    const content = message && typeof message === "object" && !Array.isArray(message)
      ? (message as { content?: unknown }).content
      : undefined;
    if (typeof content !== "string" || content.length > 20_000) {
      throw new Error("AI response is missing or exceeds the allowed size");
    }
    const cleaned = content.replace(/^```json\s*|\s*```$/g, "").trim();

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(cleaned);
    } catch {
      throw new Error("AI returned invalid JSON");
    }
    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      throw new Error("AI returned an invalid analysis");
    }
    const parsed = parsedValue as Partial<AnalyzerResult>;

    return {
      riskScore: Math.max(0, Math.min(100, Number(parsed.riskScore) || 0)),
      diversification: Math.max(0, Math.min(100, Number(parsed.diversification) || 0)),
      summary: String(parsed.summary ?? "").slice(0, 1_000),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5).map((item) => String(item).slice(0, 300)) : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.slice(0, 5).map((item) => String(item).slice(0, 300)) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 6).map((item) => String(item).slice(0, 300)) : [],
    };
  });
