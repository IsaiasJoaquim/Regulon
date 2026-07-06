import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  resolve: {
    alias: {
      "node:async_hooks": fileURLToPath(new URL("./src/shims/async-hooks.ts", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
  },
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
    nitro(),
    react(),
    tailwindcss(),
    {
      name: 'local-copilot-api',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/local-api/chat' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
              try {
                const data = JSON.parse(body);
                const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "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";
                
                const messages = data.messages || [];
                const system = "You are an AI compliance assistant for Indian securities market intermediaries (SEBI regulated). Always ground answers in the corpus.";
                
                const models = [
                  "google/gemini-2.5-flash",
                  "meta-llama/llama-3.3-70b-instruct",
                  "openai/gpt-4o-mini"
                ];
                
                let lastResponse = null;
                let lastErrText = "";
                
                for (const model of models) {
                  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${apiKey}`,
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                      model: model,
                      messages: [{ role: "system", content: system }, ...messages.map((m: any) => ({ role: m.role, content: m.content }))]
                    })
                  });
                  
                  if (response.ok) {
                    lastResponse = response;
                    break;
                  }
                  
                  lastErrText = await response.text();
                  console.warn(`Model ${model} failed:`, lastErrText);
                }
                
                if (!lastResponse) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: `OpenRouter Error (All models failed): ${lastErrText}` }));
                  return;
                }
                
                const json = await lastResponse.json();
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ text: json.choices[0].message.content }));
              } catch (e: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }
          
          // --- EXTRACTION ENDPOINT ---
          if (req.url === '/local-api/extract' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
              try {
                const data = JSON.parse(body);
                const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "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";
                
                const trimmed = (data.text || "").slice(0, 60000);
                const systemPrompt = `You are a SEBI regulatory compliance analyst. Given the text of a SEBI circular / master circular, extract a structured list of concrete, testable compliance OBLIGATIONS applicable to Indian securities market intermediaries (stockbrokers and/or investment advisers).

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

                const userPrompt = `Circular title: ${data.title}\nIntermediary focus: ${data.intermediary}\n\n--- CIRCULAR TEXT START ---\n${trimmed}\n--- CIRCULAR TEXT END ---\n\nReturn the JSON now.`;
                
                const models = [
                  "google/gemini-2.5-flash",
                  "meta-llama/llama-3.3-70b-instruct",
                  "openai/gpt-4o-mini"
                ];
                
                let aiContent = "";
                let lastErrText = "";
                
                for (const model of models) {
                  try {
                    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                      method: "POST",
                      headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                      },
                      body: JSON.stringify({
                        model: model,
                        messages: [
                          { role: "system", content: systemPrompt },
                          { role: "user", content: userPrompt }
                        ],
                        max_tokens: 4000
                      })
                    });
                    
                    if (!response.ok) {
                      lastErrText = await response.text();
                      console.warn(`[extract] Model ${model} failed:`, lastErrText);
                      continue;
                    }
                    
                    const json = await response.json();
                    const content = json.choices?.[0]?.message?.content;
                    if (content) {
                      aiContent = content;
                      console.log(`[extract] Model ${model} responded OK`);
                      break;
                    }
                    lastErrText = `${model}: no content in response`;
                  } catch (e: any) {
                    lastErrText = `${model}: ${e.message}`;
                  }
                }
                
                if (!aiContent) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: `All AI models failed. Last: ${lastErrText}` }));
                  return;
                }
                
                // Parse JSON from AI response (strip code fences if present)
                const cleaned = aiContent.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
                let parsed;
                try {
                  parsed = JSON.parse(cleaned);
                } catch {
                  const match = cleaned.match(/\{[\s\S]*\}/);
                  if (!match) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: `Model did not return valid JSON. Raw: ${aiContent.slice(0, 200)}` }));
                    return;
                  }
                  parsed = JSON.parse(match[0]);
                }
                
                const obligations = Array.isArray(parsed.obligations) ? parsed.obligations : [];
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ obligations }));
              } catch (e: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }
          
          next();
        });
      }
    }
  ],
});
