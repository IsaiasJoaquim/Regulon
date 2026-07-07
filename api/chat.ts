import { generateText, embed } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

function cosineSimilarity(vecA: number[], vecB: number[]) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return normA === 0 || normB === 0 ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;
    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;

    const gateway = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });
    const model = gateway("google/gemini-2.5-flash");

    let filteredCorpus = data.corpus || [];
    try {
      const lastMessage = data.messages[data.messages.length - 1];
      if (lastMessage.role === "user" && data.corpus?.length > 0) {
        const text = lastMessage.content;
        try {
          const { embedding: queryEmbedding } = await embed({ model: gateway("google/text-embedding-004"), value: text });
          const allObs = data.corpus.flatMap((c: any) => c.obligations.map((o: any) => ({ circular: c, ob: o }))).filter((i: any) => i.ob.embedding?.length > 0);
          if (allObs.length > 0) {
            const scored = allObs.map((i: any) => ({ ...i, score: cosineSimilarity(queryEmbedding, i.ob.embedding) })).sort((a: any, b: any) => b.score - a.score).slice(0, 10);
            const cMap = new Map();
            for (const { circular, ob } of scored) {
              if (!cMap.has(circular.id)) cMap.set(circular.id, { ...circular, obligations: [] });
              cMap.get(circular.id).obligations.push(ob);
            }
            filteredCorpus = Array.from(cMap.values());
          }
        } catch (e) {
          console.warn("RAG skipped:", e);
        }
      }
    } catch (e) {}

    const base = `You are an AI compliance assistant for Indian securities market intermediaries (SEBI regulated). You help compliance teams understand their obligations, map them to controls, and answer regulatory questions. Always ground answers in the corpus, cite obligations, and be concise.`;
    let system = base + `\n\nNo circulars ingested.`;
    if (filteredCorpus.length > 0) {
      const summary = filteredCorpus.map((c: any) => `## Circular: ${c.title}\n${c.obligations.map((o: any) => ` - [${o.id}] ${o.title}: "${o.source_excerpt}"`).join("\n")}`).join("\n\n");
      system = `${base}\n\n=== INGESTED SEBI CORPUS ===\n${summary}\n=== END CORPUS ===`;
    }

    const result = await generateText({
      model,
      system,
      messages: data.messages.map((m: any) => ({ role: m.role, content: m.content })),
      maxTokens: 1500,
    });
    
    return res.status(200).json({ text: result.text });
  } catch (e: any) {
    return res.status(500).json({ error: `Copilot falhou: ${e.message}` });
  }
}
