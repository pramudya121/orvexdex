import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Server-only provider for the Lovable AI Gateway.
 * Never import from client bundles — the filename `.server.ts` blocks that.
 */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}
