import pdfParse from "pdf-parse";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { base64 } = req.body;
    if (!base64) return res.status(400).json({ error: "Missing base64 data" });

    const buffer = Buffer.from(base64, "base64");
    const data = await pdfParse(buffer);
    
    return res.status(200).json({ text: data.text.slice(0, 80000) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
