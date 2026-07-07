export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing url" });

    const fetchRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (AgenticCompliance Bot)" },
    });
    
    if (!fetchRes.ok) throw new Error(`Fetch failed ${fetchRes.status}`);
    
    const ctype = fetchRes.headers.get("content-type") ?? "";
    if (ctype.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      throw new Error("For PDFs, please use the file upload option instead of URL fetching.");
    }
    
    const html = await fetchRes.text();
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
      
    return res.status(200).json({ text: stripped.slice(0, 80000) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
