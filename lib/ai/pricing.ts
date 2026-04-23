/**
 * Token usage + cost tracking for each analysis provider.
 *
 * Prices are list rates as of April 2026. Update the PRICING table when
 * Google or OpenAI publish new rates — nothing else needs to change.
 */

export interface ModelUsage {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  /** Estimated USD cost for this single call. */
  estimated_cost_usd: number;
}

interface ModelPricing {
  /** USD per 1,000 input tokens */
  input_per_1k: number;
  /** USD per 1,000 output tokens */
  output_per_1k: number;
}

/**
 * List pricing table. Keys are model name prefixes — longest match wins.
 * Source: https://ai.google.dev/pricing  |  https://openai.com/api/pricing
 */
const PRICING: Record<string, ModelPricing> = {
  // OpenAI — https://openai.com/api/pricing
  "gpt-4o":                  { input_per_1k: 0.0025,  output_per_1k: 0.01 },
  "gpt-4o-mini":             { input_per_1k: 0.00015, output_per_1k: 0.0006 },

  // Anthropic — https://www.anthropic.com/pricing (updated April 2026)
  // Claude 4.x — current generation
  "claude-opus-4-7":         { input_per_1k: 0.005,   output_per_1k: 0.025 },
  "claude-opus-4-6":         { input_per_1k: 0.005,   output_per_1k: 0.025 },
  "claude-opus-4-5":         { input_per_1k: 0.005,   output_per_1k: 0.025 },
  "claude-opus-4-1":         { input_per_1k: 0.015,   output_per_1k: 0.075 },
  "claude-opus-4":           { input_per_1k: 0.015,   output_per_1k: 0.075 },
  "claude-sonnet-4-6":       { input_per_1k: 0.003,   output_per_1k: 0.015 },
  "claude-sonnet-4-5":       { input_per_1k: 0.003,   output_per_1k: 0.015 },
  "claude-sonnet-4":         { input_per_1k: 0.003,   output_per_1k: 0.015 },
  "claude-haiku-4-5":        { input_per_1k: 0.001,   output_per_1k: 0.005 },
  // Claude 3.x — deprecated/retired but kept for historical cost display
  "claude-3-7-sonnet":       { input_per_1k: 0.003,   output_per_1k: 0.015 },
  "claude-3-5-sonnet":       { input_per_1k: 0.003,   output_per_1k: 0.015 },
  "claude-3-5-haiku":        { input_per_1k: 0.0008,  output_per_1k: 0.004 },
  "claude-3-opus":           { input_per_1k: 0.015,   output_per_1k: 0.075 },
  "claude-3-haiku":          { input_per_1k: 0.00025, output_per_1k: 0.00125 },

  // Google Gemini — https://ai.google.dev/pricing
  "gemini-2.5-flash-lite":   { input_per_1k: 0.000075, output_per_1k: 0.0003 },
  "gemini-2.5-flash":        { input_per_1k: 0.00015, output_per_1k: 0.0006 },
  "gemini-2.5-pro":          { input_per_1k: 0.00125, output_per_1k: 0.005 },
  "gemini-2.0-flash":        { input_per_1k: 0.0001,  output_per_1k: 0.0004 },
  "gemini-1.5-flash":        { input_per_1k: 0.000075, output_per_1k: 0.0003 },
  "gemini-1.5-pro":          { input_per_1k: 0.00125, output_per_1k: 0.005 },
};

/** Returns the pricing row for a model name, matching on longest prefix. */
function lookupPricing(model: string): ModelPricing | null {
  const lower = model.toLowerCase();
  const match = Object.keys(PRICING)
    .filter((key) => lower.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PRICING[match] : null;
}

export function buildModelUsage(params: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): ModelUsage {
  const { provider, model, inputTokens, outputTokens } = params;
  const pricing = lookupPricing(model);

  const estimated_cost_usd = pricing
    ? (inputTokens / 1000) * pricing.input_per_1k +
      (outputTokens / 1000) * pricing.output_per_1k
    : 0;

  return {
    provider,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    estimated_cost_usd: Math.round(estimated_cost_usd * 1_000_000) / 1_000_000, // 6 dp
  };
}
