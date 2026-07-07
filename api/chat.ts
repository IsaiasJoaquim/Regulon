const MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini"
];

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

    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable" });
    }

    // Build system prompt with corpus
    let filteredCorpus = data.corpus || [];
    
    const base = `You are an AI compliance assistant for Indian securities market intermediaries (SEBI regulated). You help compliance teams understand their obligations, map them to controls, and answer regulatory questions. Always ground answers in the corpus, cite obligations, and be concise.`;
    let system = base + `\n\nNo circulars ingested.`;
    if (filteredCorpus.length > 0) {
      const summary = filteredCorpus.map((c: any) => `## Circular: ${c.title}\n${c.obligations.map((o: any) => ` - [${o.id}] ${o.title}: "${o.source_excerpt}"`).join("\n")}`).join("\n\n");
      system = `${base}\n\n=== INGESTED SEBI CORPUS ===\n${summary}\n=== END CORPUS ===`;
    }

    const messages = [
      { role: "system", content: system },
      ...data.messages.map((m: any) => ({ role: m.role, content: m.content }))
    ];

    let lastError = "";

    for (const modelId of MODELS) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            messages,
            max_tokens: 1500,
          }),
        });

        if (!response.ok) {
          lastError = `${modelId}: ${response.status} ${await response.text()}`;
          console.error(`[chat] Model ${modelId} failed: ${lastError}`);
          continue;
        }

        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          console.log(`[chat] Model ${modelId} responded OK`);
          return res.status(200).json({ text: content });
        }
        lastError = `${modelId}: no content in response`;
      } catch (e: any) {
        lastError = `${modelId}: ${e.message}`;
        console.error(`[chat] Model ${modelId} exception: ${e.message}`);
      }
    }

    return res.status(500).json({ error: `All AI models failed. Last: ${lastError}` });
  } catch (e: any) {
    return res.status(500).json({ error: `Copilot failed: ${e.message}` });
  }
}
