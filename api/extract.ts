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
- evidence_examples: 2-4 short suggested evidence artefacts
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
        lastError = `${modelId}: ${res.status} ${await res.text()}`;
        continue;
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (content) return content;
      lastError = `${modelId}: no content in response`;
    } catch (e: any) {
      lastError = `${modelId}: ${e.message}`;
    }
  }

  throw new Error(`All AI models failed. Last: ${lastError}`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;
    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;

    const trimmed = data.text.slice(0, 60000);
    const userPrompt = `Circular title: ${data.title}\nIntermediary focus: ${data.intermediary}\n\n--- CIRCULAR TEXT START ---\n${trimmed}\n--- CIRCULAR TEXT END ---\n\nReturn the JSON now.`;

    const text = await callOpenRouterNonStreaming(apiKey, SYSTEM_EXTRACT, userPrompt);

    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

    let parsed: { obligations?: unknown };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`Model did not return JSON. Raw response: ${text.slice(0, 100)}...`);
      parsed = JSON.parse(match[0]);
    }
    
    const raw = Array.isArray(parsed.obligations) ? parsed.obligations : [];
    if (raw.length === 0) throw new Error(`Model returned no obligations. Raw response: ${text.slice(0, 150)}`);

    const obligations = raw.map((o: any) => {
      const ev = Array.isArray(o.evidence_examples) ? o.evidence_examples.map(String) : [];
      return {
        id: String(o.id ?? ""),
        title: String(o.title ?? "Untitled obligation"),
        description: String(o.description ?? ""),
        intermediary: String(o.intermediary ?? data.intermediary),
        category: String(o.category ?? "General"),
        frequency: String(o.frequency ?? "continuous"),
        severity: String(o.severity ?? "medium"),
        evidence_examples: ev,
        source_excerpt: String(o.source_excerpt ?? ""),
        embedding: [],
      };
    });

    return res.status(200).json({ obligations });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
