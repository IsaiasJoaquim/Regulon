import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { addCircular, slugify, type Circular, type Obligation } from "@/lib/store";
import { Loader2, Sparkles, ExternalLink, UploadCloud } from "lucide-react";

export const Route = createFileRoute("/ingest")({
  component: Ingest,
});

const SAMPLE = {
  broker: {
    title: "SEBI Master Circular for Stock Brokers (excerpt)",
    text: `Every stock broker shall segregate securities of clients and shall not use them for own purposes or for any other client. Client securities available with the broker shall not be pledged to raise funds for own purposes.

Stock brokers shall report their client-level bank and securities balances to the exchanges on a daily basis. Weekly and monthly enhanced supervision reports must reconcile client funds and securities held with actual balances.

Stock brokers shall maintain segregated bank accounts titled "client account" and "own account". No inter-client transfer shall be effected in the client bank account except as permitted by SEBI.

Every stock broker shall have a Board-approved Cyber Security and Cyber Resilience policy reviewed at least annually. Vulnerability Assessment and Penetration Testing (VAPT) shall be conducted at least once every financial year, and reports submitted to the stock exchange within one month.

Every registered broker shall redress investor grievances within 21 working days and shall submit a monthly report on complaints received and resolved to the stock exchange.

Stock brokers shall obtain and periodically update KYC of every client in accordance with the PMLA guidelines. In-person verification of the client shall be carried out at the time of onboarding.

Stock brokers shall settle the running account of client funds on a quarterly basis (or monthly if the client so opts) and issue a retention statement to the client.`,
  },
  adviser: {
    title: "SEBI Master Circular for Investment Advisers (excerpt)",
    text: `An investment adviser shall act in a fiduciary capacity towards its clients and shall disclose all conflicts of interest as and when they arise.

Every investment adviser shall carry out risk profiling of the client before providing investment advice, and shall provide suitability assessment demonstrating that the advice is suitable to the client's risk profile.

Investment advisers shall segregate the activities of advisory and distribution at client level. A client can either avail advisory services or distribution services from an investment adviser, not both.

Fees charged by investment advisers shall be in accordance with the fee limits prescribed by SEBI. Investment advisers shall obtain client consent in writing for the fee structure.

Every investment adviser shall maintain records of client interactions, advice given, and rationale for advice, for a period of five years. Records shall be produced to SEBI on request.

Investment advisers shall undergo an annual compliance audit from a member of the Institute of Chartered Accountants of India or Institute of Company Secretaries of India, and submit the audit report to SEBI within six months of the financial year end.

Investment advisers shall not receive any consideration by way of remuneration, commission or non-cash reward from any person other than the client being advised.`,
  },
};

function Ingest() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [intermediary, setIntermediary] = useState<"stockbroker" | "investment_adviser" | "both">("stockbroker");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "fetching" | "extracting" | "uploading">("");

  async function handleFetch() {
    if (!url) return;
    setBusy("fetching");
    try {
      const response = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Fetch failed");
      setText(data.text);
      toast.success(`Fetched ${data.text.length.toLocaleString()} chars from URL`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setBusy("");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Please upload a valid PDF file.");
      return;
    }
    
    setBusy("uploading");
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Use FileReader for robust base64 conversion of large files in browser
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = (event.target?.result as string).split(',')[1];
          const response = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64 })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Upload failed");
          setText(data.text);
          if (!title) setTitle(file.name.replace(".pdf", ""));
          toast.success(`Extracted ${data.text.length.toLocaleString()} chars from PDF`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "PDF extraction failed");
        } finally {
          setBusy("");
          e.target.value = '';
        }
      };
      reader.onerror = () => {
        toast.error("Failed to read file");
        setBusy("");
        e.target.value = '';
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF processing failed");
      setBusy("");
      e.target.value = '';
    }
  }

  function loadSample(kind: "broker" | "adviser") {
    const s = SAMPLE[kind];
    setTitle(s.title);
    setText(s.text);
    setIntermediary(kind === "broker" ? "stockbroker" : "investment_adviser");
    toast.success("Loaded sample circular excerpt");
  }

  async function handleExtract() {
    if (!title.trim() || text.trim().length < 1) {
      toast.error("Please provide a title and at least a paragraph of circular text.");
      return;
    }
    setBusy("extracting");
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), intermediary, text })
      });
      
      const rawText = await response.text();
      let result;
      try {
        result = JSON.parse(rawText);
      } catch {
        toast.error("Invalid response from AI server: " + rawText.slice(0, 100));
        setBusy("");
        return;
      }
      
      if (result.error) {
        toast.error(result.error);
        setBusy("");
        return;
      }

      const cleaned: Obligation[] = (result.obligations ?? []).map((o: any, i: number) => {
        const baseSlug = slugify(o.id || o.title || `ob-${i}`);
        const obId = `${baseSlug.slice(0, 10)}-${Math.random().toString(36).substring(2, 7)}`;
        
        return {
          id: obId,
          title: String(o.title ?? "Untitled obligation"),
          description: String(o.description ?? ""),
          intermediary: (["stockbroker", "investment_adviser", "both"].includes(o.intermediary) ? o.intermediary : intermediary) as Obligation["intermediary"],
          category: String(o.category ?? "General"),
          frequency: String(o.frequency ?? "continuous"),
          severity: (["low", "medium", "high", "critical"].includes(o.severity) ? o.severity : "medium") as Obligation["severity"],
          evidence_examples: Array.isArray(o.evidence_examples) ? o.evidence_examples.map(String) : [],
          source_excerpt: String(o.source_excerpt ?? "").slice(0, 400),
        };
      });

      if (cleaned.length === 0) {
        toast.error("Model returned no obligations.", { description: `Raw API response: ${JSON.stringify(result)}` });
        setBusy("");
        return;
      }

      const circId = `c-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      
      const circular: Circular = {
        id: circId,
        title: title.trim(),
        intermediary,
        ingestedAt: new Date().toISOString(),
        obligations: cleaned,
      };
      addCircular(circular);
      toast.success(`Extracted ${cleaned.length} obligations`);
      navigate({ to: "/obligations" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Ingest a SEBI circular</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a URL or the full text of a SEBI master circular / notification. Regulon will extract structured, testable obligations.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-6">
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => loadSample("broker")}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Try sample: Stockbroker</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Excerpt covering client segregation, cyber security, KYC, grievances, quarterly settlement.</CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => loadSample("adviser")}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Try sample: Investment Adviser</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Excerpt covering fiduciary duty, risk profiling, fee limits, recordkeeping, annual audit.</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Circular details</CardTitle>
          <CardDescription>
            Public SEBI master circulars are available at{" "}
            <a href="https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListingAll=yes&search=&hits=15&sid=1&ssid=6&smid=0" target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-0.5 hover:underline">
              sebi.gov.in <ExternalLink className="w-3 h-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Circular title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Master Circular for Stock Brokers 2024" className="mt-1.5" />
          </div>

          <div>
            <Label>Applicable to</Label>
            <RadioGroup value={intermediary} onValueChange={(v) => setIntermediary(v as typeof intermediary)} className="flex gap-4 mt-2">
              <div className="flex items-center gap-2"><RadioGroupItem value="stockbroker" id="r1" /><Label htmlFor="r1" className="font-normal">Stockbroker</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="investment_adviser" id="r2" /><Label htmlFor="r2" className="font-normal">Investment Adviser</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="both" id="r3" /><Label htmlFor="r3" className="font-normal">Both</Label></div>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="url">Fetch from URL (HTML pages only)</Label>
            <div className="flex gap-2 mt-1.5">
              <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.sebi.gov.in/legal/master-circulars/..." />
              <Button variant="outline" onClick={handleFetch} disabled={!url || busy !== ""}>
                {busy === "fetching" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch"}
              </Button>
            </div>
          </div>

          <div className="pt-2">
            <Label>Or Upload PDF</Label>
            <div className="mt-1.5 border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-muted/50 transition-colors">
              <UploadCloud className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Upload a SEBI Circular PDF</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Maximum size: 10MB</p>
              <Input 
                type="file" 
                accept="application/pdf" 
                className="hidden" 
                id="pdf-upload" 
                onChange={handleFileUpload} 
                disabled={busy !== ""} 
              />
              <Button variant="secondary" asChild disabled={busy !== ""}>
                <label htmlFor="pdf-upload" className="cursor-pointer">
                  {busy === "uploading" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Select PDF File
                </label>
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="text">Circular text</Label>
            <Textarea id="text" value={text} onChange={(e) => setText(e.target.value)} rows={14} placeholder="Paste the full text of the SEBI circular here..." className="mt-1.5 font-mono text-xs" />
            <p className="text-xs text-muted-foreground mt-1">{text.length.toLocaleString()} characters</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleExtract} disabled={busy !== ""} size="lg">
              {busy === "extracting" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> <span>Extracting obligations…</span></>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> <span>Extract obligations with AI</span></>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
