import { createOpenAI } from "@ai-sdk/openai";

export function createAiGatewayProvider() {
  // Try to get API key from various environment sources
  const apiKey = typeof process !== 'undefined' ? (process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || process.env.AI_API_KEY) : undefined 
    || (import.meta as any).env?.VITE_OPENAI_API_KEY 
    || (import.meta as any).env?.OPENAI_API_KEY
    || (import.meta as any).env?.AI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY or AI_API_KEY. Please add VITE_OPENAI_API_KEY to your .env file.");
  }

  return createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey
  });
}
