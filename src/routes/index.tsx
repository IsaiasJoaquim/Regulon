import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStore, evidenceKey, type EvidenceStatus } from "@/lib/store";
import { AlertTriangle, CheckCircle2, Clock, FileText, ArrowRight, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const STATUS_META: Record<EvidenceStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  compliant: { label: "Compliant", color: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  in_progress: { label: "In progress", color: "text-blue-600 bg-blue-50 border-blue-200", icon: Clock },
  pending: { label: "Pending", color: "text-amber-700 bg-amber-50 border-amber-200", icon: Clock },
  gap: { label: "Gap", color: "text-red-600 bg-red-50 border-red-200", icon: AlertTriangle },
};

function Dashboard() {
  const { corpus, evidence } = useStore();

  const allObs = corpus.flatMap((c) =>
    c.obligations.map((o) => ({
      circular: c,
      ob: o,
      status: (evidence[evidenceKey(c.id, o.id)]?.status ?? "pending") as EvidenceStatus,
    })),
  );
  const total = allObs.length;
  const counts: Record<EvidenceStatus, number> = { compliant: 0, in_progress: 0, pending: 0, gap: 0 };
  allObs.forEach((x) => (counts[x.status] += 1));
  const compliancePct = total > 0 ? Math.round(((counts.compliant + counts.in_progress * 0.5) / total) * 100) : 0;
  const gaps = allObs.filter((x) => x.status === "gap" || (x.status === "pending" && (x.ob.severity === "high" || x.ob.severity === "critical")));

  if (total === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" /> HackCulture · GFF 2026 · Problem Statement 2
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            From SEBI regulatory text to operational compliance action.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Regulon ingests SEBI master circulars for stockbrokers and investment advisers,
            extracts structured, testable obligations with AI, maps them to your controls,
            and gives your compliance team an auditable trail plus a regulatory copilot.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg">
              <Link to="/ingest">
                Ingest a SEBI circular <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/chat">Open the Copilot</Link>
            </Button>
          </div>
        </div>
        <div className="mt-16 grid md:grid-cols-3 gap-4">
          {[
            { t: "1. Ingest", d: "Paste a SEBI circular URL or full text. AI extracts obligations grounded in verbatim excerpts." },
            { t: "2. Map & Track", d: "Every obligation is tagged with intermediary, category, frequency, severity — with evidence workflow." },
            { t: "3. Query", d: "The copilot answers regulatory questions with citations to your ingested corpus." },
          ].map((s) => (
            <Card key={s.t}>
              <CardHeader><CardTitle className="text-base">{s.t}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{s.d}</CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Compliance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {corpus.length} circular{corpus.length > 1 ? "s" : ""} ingested · {total} obligations tracked
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/ingest">+ Ingest circular</Link></Button>
          <Button asChild><Link to="/obligations">View obligations</Link></Button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overall compliance</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{compliancePct}%</div>
            <Progress value={compliancePct} className="mt-3" />
          </CardContent>
        </Card>
        {(["compliant", "in_progress", "pending", "gap"] as EvidenceStatus[]).map((s) => {
          const Icon = STATUS_META[s].icon;
          return (
            <Card key={s}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Icon className="w-4 h-4" /> {STATUS_META[s].label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{counts[s]}</div>
                <div className="text-xs text-muted-foreground mt-1">{total > 0 ? Math.round((counts[s] / total) * 100) : 0}% of total</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Priority gaps</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {gaps.length === 0 && <p className="text-sm text-muted-foreground">No high-severity gaps 🎉</p>}
            {gaps.slice(0, 8).map((g) => {
              const meta = STATUS_META[g.status];
              return (
                <Link
                  key={`${g.circular.id}-${g.ob.id}`}
                  to="/obligations"
                  className="block border rounded-md p-3 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{g.ob.title}</div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {g.circular.title} · {g.ob.category} · {g.ob.frequency}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
                      <Badge variant={g.ob.severity === "critical" ? "destructive" : "secondary"} className="text-[10px] uppercase">
                        {g.ob.severity}
                      </Badge>
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ingested circulars</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {corpus.map((c) => {
              const cObs = c.obligations;
              const cCompliant = cObs.filter((o) => evidence[evidenceKey(c.id, o.id)]?.status === "compliant").length;
              const pct = cObs.length > 0 ? Math.round((cCompliant / cObs.length) * 100) : 0;
              return (
                <div key={c.id} className="border rounded-md p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        {c.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {cObs.length} obligations · Focus: {c.intermediary.replace("_", " ")}
                      </div>
                    </div>
                    <Badge variant="secondary">{pct}% compliant</Badge>
                  </div>
                  <Progress value={pct} className="mt-2 h-1.5" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
