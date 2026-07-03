import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const HoldingSchema = z.object({
  symbol: z.string(),
  amount: z.string(),
  valueWzk: z.string().optional(),
  share: z.number().optional(),
});

const InputSchema = z.object({
  address: z.string(),
  totalValueWzk: z.string(),
  holdings: z.array(HoldingSchema),
  lpCount: z.number(),
  farmingCount: z.number(),
});

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
  .inputValidator((data) => InputSchema.parse(data))
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
      const text = await res.text();
      throw new Error(`AI gateway ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/^```json\s*|\s*```$/g, "").trim();

    let parsed: AnalyzerResult;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    return {
      riskScore: Math.max(0, Math.min(100, Number(parsed.riskScore) || 0)),
      diversification: Math.max(0, Math.min(100, Number(parsed.diversification) || 0)),
      summary: String(parsed.summary ?? ""),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5).map(String) : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.slice(0, 5).map(String) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 6).map(String) : [],
    };
  });
