import { createFileRoute } from "@tanstack/react-router";

type CorpusItem = {
  id: string;
  title: string;
  intermediary: string;
  obligations: Array<{
    id: string;
    title: string;
    description: string;
    intermediary: string;
    category: string;
    frequency: string;
    severity: string;
    source_excerpt: string;
    embedding?: number[];
  }>;
};

type ChatBody = {
  messages?: Array<{ role: string; content: string; parts?: Array<{ type: string; text: string }> }>;
  corpus?: CorpusItem[];
};

function cosineSimilarity(vecA: number[], vecB: number[]) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildSystem(corpus: CorpusItem[] | undefined) {
  const base = `You are an AI compliance assistant for Indian securities market intermediaries (SEBI regulated). You help compliance teams understand their obligations, map them to controls, and answer regulatory questions.

Always:
- Ground answers in the provided corpus of extracted obligations. If the answer is not in the corpus, say so.
- Cite obligations inline like [circular_title › obligation_id].
- Prefer concrete, actionable steps (who does what, when, evidence).
- Be concise. Use bullet points for multi-step actions.`;

  if (!corpus || corpus.length === 0) {
    return (
      base +
      `\n\nNo circulars have been ingested yet. Politely tell the user to ingest a SEBI circular first on the Ingest page.`
    );
  }

  const summary = corpus
    .map((c) => {
      const obs = c.obligations
        .map(
          (o) =>
            `  - [${o.id}] (${o.intermediary}, ${o.category}, ${o.frequency}, ${o.severity}) ${o.title}\n    excerpt: "${o.source_excerpt}"`,
        )
        .join("\n");
      return `## Circular: ${c.title} (id=${c.id}, focus=${c.intermediary})\n${obs}`;
    })
    .join("\n\n");

  return `${base}\n\n=== INGESTED SEBI CORPUS ===\n${summary}\n=== END CORPUS ===`;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
    // Dynamic imports to avoid bundling Node.js-only modules in the client
    const { streamText, embed } = await import("ai");
    const { createAiGatewayProvider } = await import("@/lib/ai-gateway.server");

    const body = (await request.json()) as ChatBody;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response("Messages are required", { status: 400 });
    }
    
    const gateway = createAiGatewayProvider();
    const modelId = "google/gemini-2.5-flash:free";
    const model = gateway(modelId);
    
    // RAG implementation
    let filteredCorpus = body.corpus;
    
    try {
      const lastMessage = body.messages[body.messages.length - 1];
      if (lastMessage.role === "user" && body.corpus && body.corpus.length > 0) {
        const text = Array.isArray(lastMessage.parts) 
          ? lastMessage.parts.map((p: any) => p.text).join("")
          : lastMessage.content;
          
        // Safe RAG wrapper: if embedding fails, it falls back to full corpus silently
        try {
          const { embedding: queryEmbedding } = await embed({
            model: gateway("google/text-embedding-004"),
            value: text
          });
          
          const allObs = body.corpus.flatMap(c => 
            c.obligations.map(o => ({ circular: c, ob: o }))
          ).filter(item => item.ob.embedding && item.ob.embedding.length > 0);
          
          if (allObs.length > 0) {
            const scored = allObs.map(item => ({
              ...item,
              score: cosineSimilarity(queryEmbedding, item.ob.embedding!)
            }));
            scored.sort((a, b) => b.score - a.score);
            const topObs = scored.slice(0, 10);
            
            const cMap = new Map<string, CorpusItem>();
            for (const { circular, ob } of topObs) {
              if (!cMap.has(circular.id)) {
                cMap.set(circular.id, { ...circular, obligations: [] });
              }
              cMap.get(circular.id)!.obligations.push(ob);
            }
            filteredCorpus = Array.from(cMap.values());
          }
        } catch (e) {
          console.warn("RAG skipped: Embedding model failed or unavailable. Using full corpus.", e);
        }
      }
    } catch (e) {
      console.error("RAG error, falling back to full corpus", e);
    }

    try {
      const result = streamText({
        model,
        maxTokens: 2000,
        system: buildSystem(filteredCorpus),
        messages: body.messages.map((m: any) => {
          let content = m.content;
          if (m.parts && Array.isArray(m.parts)) {
            content = m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
          }
          return { role: m.role, content };
        }),
      });

      // @ts-ignore
      return result.toUIMessageStreamResponse({
        originalMessages: body.messages,
      });
    } catch (e: any) {
      console.error("LLM Stream Error:", e);
      return new Response(e.message || "An error occurred with the AI model", { status: 500 });
    }
      },
    },
  },
});

