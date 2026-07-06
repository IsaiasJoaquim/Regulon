import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type RawObligation = {
  id: string;
  title: string;
  description: string;
  intermediary: string;
  category: string;
  frequency: string;
  severity: string;
  evidence_examples: string[];
  source_excerpt: string;
  embedding?: number[];
};

const ExtractInput = z.object({
  title: z.string().min(1),
  intermediary: z.enum(["stockbroker", "investment_adviser", "both"]),
  text: z.string().min(1),
});

const MODELS = [
  "google/gemini-2.5-flash",
  "meta-llama/llama-3.3-70b-instruct",
  "openai/gpt-4o-mini"
];

const SYSTEM_EXTRACT = `You are a SEBI regulatory compliance analyst. Given the text of a SEBI circular / master circular, extract a structured list of concrete, testable compliance OBLIGATIONS applicable to Indian securities market intermediaries (stockbrokers and/or investment advisers).

For EACH obligation return:
- id: short kebab-case slug
- title: one-line imperative summary (<=110 chars)
- description: 1-3 sentence plain-English explanation of what must be done
- intermediary: one of "stockbroker" | "investment_adviser" | "both"
- category: e.g. "KYC", "Risk Management", "Disclosure", "Recordkeeping", "Grievance Redressal", "Cyber Security", "Reporting"
- frequency: "one-time" | "daily" | "monthly" | "quarterly" | "half-yearly" | "annually" | "event-based" | "continuous"
- severity: "low" | "medium" | "high" | "critical"
- evidence_examples: 2-4 short suggested evidence artefacts (e.g. "signed KYC form", "quarterly compliance report to SEBI")
- source_excerpt: short verbatim quote (<=240 chars) from the circular that supports this obligation

Return STRICT JSON of shape:
{"obligations":[ {...}, ... ]}

Rules:
- 5 to 25 obligations. If the text is short, extract fewer high-confidence ones.
- No commentary outside JSON. No markdown fences.
- Every obligation must be grounded in an actual excerpt from the provided text.`;

async function callOpenRouterNonStreaming(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  let lastError = "";

  for (const modelId of MODELS) {
    try {
      console.log(`[extract] Trying model: ${modelId}`);
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 4000,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        lastError = `${modelId}: ${res.status} ${errBody}`;
        console.error(`[extract] Model ${modelId} failed: ${lastError}`);
        continue;
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (content) {
        console.log(`[extract] Model ${modelId} responded OK`);
        return content;
      }
      lastError = `${modelId}: no content in response`;
    } catch (e: any) {
      lastError = `${modelId}: ${e.message}`;
      console.error(`[extract] Model ${modelId} exception: ${e.message}`);
    }
  }

  throw new Error(`All AI models failed. Last: ${lastError}`);
}

export const extractObligations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ExtractInput.parse(input))
  .handler(async ({ data }) => {
    // Try to get API key from various environment sources
    const apiKey = typeof process !== 'undefined' ? (process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY) : undefined 
      || (import.meta as any).env?.VITE_OPENAI_API_KEY 
      || (import.meta as any).env?.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY. Please add VITE_OPENAI_API_KEY to your .env file.");
    }

    const trimmed = data.text.slice(0, 60000);
    const userPrompt = `Circular title: ${data.title}
Intermediary focus: ${data.intermediary}

--- CIRCULAR TEXT START ---
${trimmed}
--- CIRCULAR TEXT END ---

Return the JSON now.`;

    const text = await callOpenRouterNonStreaming(apiKey, SYSTEM_EXTRACT, userPrompt);

    // Strip potential code fences defensively
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed: { obligations?: unknown };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`Model did not return JSON. Raw response: ${text.slice(0, 100)}...`);
      parsed = JSON.parse(match[0]);
    }
    const raw = Array.isArray(parsed.obligations) ? parsed.obligations : [];
    
    if (raw.length === 0) {
      throw new Error(`Model returned no obligations. Raw response: ${text.slice(0, 150)}`);
    }

    const obligations: RawObligation[] = raw.map((o: any) => {
      const r = (o ?? {}) as Record<string, unknown>;
      const ev = Array.isArray(r.evidence_examples)
        ? (r.evidence_examples as unknown[]).map((x) => String(x))
        : [];
      return {
        id: String(r.id ?? ""),
        title: String(r.title ?? "Untitled obligation"),
        description: String(r.description ?? ""),
        intermediary: String(r.intermediary ?? data.intermediary),
        category: String(r.category ?? "General"),
        frequency: String(r.frequency ?? "continuous"),
        severity: String(r.severity ?? "medium"),
        evidence_examples: ev,
        source_excerpt: String(r.source_excerpt ?? ""),
        embedding: [],
      };
    });
    return { obligations };
  });


const FetchInput = z.object({ url: z.string().url() });

export const fetchCircular = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FetchInput.parse(input))
  .handler(async ({ data }) => {
    const res = await fetch(data.url, {
      headers: { "User-Agent": "Mozilla/5.0 (AgenticCompliance Bot)" },
    });
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    const ctype = res.headers.get("content-type") ?? "";
    if (ctype.includes("pdf") || data.url.toLowerCase().endsWith(".pdf")) {
      throw new Error(
        "For PDFs, please use the file upload option instead of URL fetching.",
      );
    }
    const html = await res.text();
    // naive strip
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    return { text: stripped.slice(0, 80000) };
  });

export const uploadPdf = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: FormData }) => {
    const file = data.get("file") as File;
    if (!file) throw new Error("No file provided");
    
    // Dynamic import to avoid client-side bundling issues
    const pdfParse = (await import("pdf-parse")).default;
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    try {
      const data = await pdfParse(buffer);
      return { text: data.text.slice(0, 80000) };
    } catch (e) {
      throw new Error("Failed to parse PDF: " + (e instanceof Error ? e.message : String(e)));
    }
  });

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

export const askCopilot = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: any }) => {
    try {
      const apiKey = typeof process !== 'undefined' ? (process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY) : undefined 
        || (import.meta as any).env?.VITE_OPENAI_API_KEY 
        || (import.meta as any).env?.OPENAI_API_KEY;

      if (!apiKey) return { error: "Missing OPENAI_API_KEY in .env file" };

      const { generateText, embed } = await import("ai");
      const { createOpenAI } = await import("@ai-sdk/openai");
      const gateway = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });
      const model = gateway("google/gemini-2.5-flash:free");

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
      return { text: result.text };
    } catch (e: any) {
      return { error: `Copilot falhou: ${e.message}` };
    }
  });
