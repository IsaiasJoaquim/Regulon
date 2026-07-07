import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  useStore,
  evidenceKey,
  updateEvidence,
  removeCircular,
  type EvidenceStatus,
  type Obligation,
  type Circular,
} from "@/lib/store";
import { storage, BUCKET_ID } from "@/lib/appwrite";
import { ID } from "appwrite";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Trash2, Quote, Loader2 } from "lucide-react";

export const Route = createFileRoute("/obligations")({
  component: Obligations,
});

const STATUS_LABEL: Record<EvidenceStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  compliant: "Compliant",
  gap: "Gap",
};
const STATUS_CLR: Record<EvidenceStatus, string> = {
  compliant: "text-emerald-700 bg-emerald-50 border-emerald-200",
  in_progress: "text-blue-700 bg-blue-50 border-blue-200",
  pending: "text-amber-700 bg-amber-50 border-amber-200",
  gap: "text-red-700 bg-red-50 border-red-200",
};

function SevBadge({ s }: { s: Obligation["severity"] }) {
  const map = {
    low: "bg-slate-100 text-slate-700",
    medium: "bg-blue-100 text-blue-800",
    high: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
  } as const;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${map[s]}`}>{s}</span>;
}

function Obligations() {
  const { corpus, evidence } = useStore();
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | EvidenceStatus>("all");
  const [filterInter, setFilterInter] = useState<"all" | "stockbroker" | "investment_adviser" | "both">("all");
  const [active, setActive] = useState<{ c: Circular; o: Obligation } | null>(null);

  const rows = useMemo(() => {
    const items = corpus.flatMap((c) =>
      c.obligations.map((o) => ({
        c,
        o,
        status: (evidence[evidenceKey(c.id, o.id)]?.status ?? "pending") as EvidenceStatus,
        note: evidence[evidenceKey(c.id, o.id)]?.note ?? "",
      })),
    );
    return items.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterInter !== "all" && r.o.intermediary !== filterInter) return false;
      if (q) {
        const hay = `${r.o.title} ${r.o.description} ${r.o.category} ${r.c.title}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [corpus, evidence, q, filterStatus, filterInter]);

  if (corpus.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">No obligations yet</h1>
        <p className="mt-2 text-muted-foreground">Ingest a SEBI circular to start tracking obligations.</p>
        <Button asChild className="mt-6"><a href="/ingest">Go to Ingest</a></Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Obligations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} of {corpus.reduce((n, c) => n + c.obligations.length, 0)} obligations
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_LABEL) as EvidenceStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterInter} onValueChange={(v) => setFilterInter(v as typeof filterInter)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All intermediaries</SelectItem>
              <SelectItem value="stockbroker">Stockbroker</SelectItem>
              <SelectItem value="investment_adviser">Investment Adviser</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-6">
        {corpus.map((c) => {
          const items = rows.filter((r) => r.c.id === c.id);
          if (items.length === 0) return null;
          return (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{c.title}</CardTitle>
                  <div className="text-xs text-muted-foreground mt-1">
                    Ingested {new Date(c.ingestedAt).toLocaleString()} · Focus: {c.intermediary.replace("_", " ")} · {c.obligations.length} obligations
                  </div>
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => {
                    if (confirm(`Remove "${c.title}" and all its evidence?`)) {
                      removeCircular(c.id);
                      toast.success("Circular removed");
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="border-t">
                  {items.map((r) => (
                    <div
                      key={r.o.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActive({ c: r.c, o: r.o })}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActive({ c: r.c, o: r.o }); }}
                      className="w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-secondary/50 transition-colors flex items-start gap-3 cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{r.o.title}</span>
                          <SevBadge s={r.o.severity} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="font-normal">{r.o.category}</Badge>
                          <span>· {r.o.frequency}</span>
                          <span>· {r.o.intermediary.replace("_", " ")}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className={`${STATUS_CLR[r.status]} shrink-0`}>{STATUS_LABEL[r.status]}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{active.o.title}</DialogTitle>
                <DialogDescription>
                  {active.c.title}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{active.o.category}</Badge>
                  <Badge variant="secondary">{active.o.frequency}</Badge>
                  <Badge variant="secondary">{active.o.intermediary.replace("_", " ")}</Badge>
                  <SevBadge s={active.o.severity} />
                </div>

                <p className="text-sm">{active.o.description}</p>

                {active.o.source_excerpt && (
                  <div className="border-l-2 border-primary pl-3 py-1 bg-secondary/40 rounded-r">
                    <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
                      <Quote className="w-3 h-3" /> Verbatim excerpt
                    </div>
                    <p className="text-xs italic">{active.o.source_excerpt}</p>
                  </div>
                )}

                <div>
                  <div className="text-sm font-medium mb-2">Suggested evidence</div>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {active.o.evidence_examples.map((e, i) => (
                      <li key={i} className="flex gap-2"><span className="text-primary">•</span>{e}</li>
                    ))}
                  </ul>
                </div>

                <StatusEditor circularId={active.c.id} obligationId={active.o.id} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActive(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusEditor({ circularId, obligationId }: { circularId: string; obligationId: string }) {
  const { evidence } = useStore();
  const rec = evidence[evidenceKey(circularId, obligationId)];
  const [status, setStatus] = useState<EvidenceStatus>(rec?.status ?? "pending");
  const [note, setNote] = useState(rec?.note ?? "");
  const [busy, setBusy] = useState(false);

  const iconFor = (s: EvidenceStatus) =>
    s === "compliant" ? <CheckCircle2 className="w-4 h-4" /> : s === "gap" ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setBusy(true);
    try {
      const upload = await storage.createFile(BUCKET_ID, ID.unique(), file);
      const url = storage.getFileView(BUCKET_ID, upload.$id);
      await updateEvidence(circularId, obligationId, { status, note, fileUrl: url });
      toast.success("Evidence file uploaded successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = ''; // Reset input
    }
  }

  return (
    <div className="border rounded-md p-3 bg-muted/40 space-y-3">
      <div className="text-sm font-medium">Compliance status & evidence</div>
      <div className="grid grid-cols-2 gap-2">
        {(["pending", "in_progress", "compliant", "gap"] as EvidenceStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`flex items-center gap-2 px-3 py-2 rounded border text-sm ${status === s ? `${STATUS_CLR[s]} font-semibold` : "border-border hover:bg-secondary"}`}
          >
            {iconFor(s)} {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <Textarea
        rows={3}
        placeholder="Evidence reference (e.g. link to policy doc, ticket, audit report, employee owner…)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Input 
            type="file" 
            id={`file-${circularId}-${obligationId}`}
            className="hidden" 
            onChange={handleFileUpload} 
            disabled={busy} 
          />
          <Button variant="outline" size="sm" asChild disabled={busy}>
            <label htmlFor={`file-${circularId}-${obligationId}`} className="cursor-pointer">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {rec?.fileUrl ? "Replace File" : "Upload File"}
            </label>
          </Button>
          {rec?.fileUrl && (
            <Button variant="secondary" size="sm" asChild>
              <a href={rec.fileUrl} target="_blank" rel="noreferrer">View File</a>
            </Button>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => {
            updateEvidence(circularId, obligationId, { status, note });
            toast.success("Evidence saved");
          }}
        >
          Save
        </Button>
      </div>
      {rec?.updatedAt && (
        <div className="text-xs text-muted-foreground">Last updated {new Date(rec.updatedAt).toLocaleString()}</div>
      )}
    </div>
  );
}
