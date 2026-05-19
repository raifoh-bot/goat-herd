import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Filter, LayoutGrid, LayoutList, List, Plus, Search, Upload, ArrowRight, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { getListGoatsQueryKey, useListGoats } from "@workspace/api-client-react";
import type { Goat, ListGoatsSex, ListGoatsStatus } from "@workspace/api-client-react/src/generated/api.schemas";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { GoatCard } from "@/components/goat-card";
import { formatAge } from "@/lib/age";

export const breedLabels: Record<string, string> = {
  alpine: "Alpine",
  nubian: "Nubian",
  saanen: "Saanen",
  lamancha: "LaMancha",
  toggenburg: "Toggenburg",
  boer: "Boer",
  "nigerian-dwarf": "Nigerian Dwarf",
  oberhasli: "Oberhasli",
  mixed: "Mixed",
};

const lactationLabels: Record<string, string> = {
  milking: "Milking",
  dry: "Dry",
  exposed: "Exposed",
  serviced: "Serviced",
  pregnant: "Pregnant",
  kid: "Kid",
  retired: "Retired",
};

const herdStatusLabels: Record<string, string> = {
  dead: "Dead",
  "first-freshener": "First Freshener",
  leased: "Leased",
  "on-farm": "On Farm",
  retired: "Retired",
  sold: "Sold",
};

type ViewMode = "grid" | "compact" | "list";

function sexLabel(goat: Goat) {
  if (goat.sex === "doe") return "Doe ♀";
  if (goat.sex === "wether") return "Wether ⚬";
  if (goat.sex === "buck") return goat.leasedBuck ? "Leased Buck ♂" : "Buck ♂";
  return "—";
}

function GoatRow({ goat }: { goat: Goat }) {
  return (
    <Link href={`/goats/${goat.id}`}>
      <div className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer border-b border-border last:border-0 group">
        <div className="h-10 w-10 rounded-lg bg-primary/10 overflow-hidden border border-primary/10 shrink-0">
          {goat.imageUrl
            ? <img src={goat.imageUrl} alt={goat.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-primary/40 text-xs font-bold uppercase">{goat.name.slice(0, 2)}</div>
          }
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-7 gap-x-4 items-center">
          <div className="md:col-span-2">
            <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">{goat.name}</p>
            {goat.registeredName && <p className="text-xs text-muted-foreground/70 truncate italic">{goat.registeredName}</p>}
            {goat.adgaId && <p className="text-xs text-muted-foreground/60 font-mono">#{goat.adgaId}</p>}
          </div>
          <div className="hidden md:block">
            <Badge variant="outline" className="text-xs capitalize">{breedLabels[goat.breed] ?? goat.breed}</Badge>
          </div>
          <div className="hidden md:block text-sm text-muted-foreground capitalize">{sexLabel(goat)}</div>
          <div className="hidden md:block text-sm text-muted-foreground">{formatAge(goat.dateOfBirth)} old</div>
          <div className="hidden md:block text-sm text-muted-foreground">
            {goat.lactationStatus ? lactationLabels[goat.lactationStatus] ?? goat.lactationStatus : <span className="text-muted-foreground/40">—</span>}
          </div>
          <div className="hidden md:block">
            {goat.herdStatus
              ? <Badge variant="secondary" className="text-xs">{herdStatusLabels[goat.herdStatus] ?? goat.herdStatus}</Badge>
              : <span className="text-xs text-muted-foreground/50">—</span>
            }
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
      </div>
    </Link>
  );
}

function CompactCard({ goat }: { goat: Goat }) {
  return (
    <Link href={`/goats/${goat.id}`}>
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group">
        <div className="h-12 w-12 rounded-lg bg-primary/10 overflow-hidden border border-primary/10 shrink-0">
          {goat.imageUrl
            ? <img src={goat.imageUrl} alt={goat.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-primary/40 text-sm font-bold uppercase">{goat.name.slice(0, 2)}</div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors text-sm">{goat.name}</p>
          <p className="text-xs text-muted-foreground truncate">{breedLabels[goat.breed] ?? goat.breed} · {sexLabel(goat)}</p>
          <p className="text-xs text-muted-foreground/70">{formatAge(goat.dateOfBirth)} old{goat.lactationStatus ? ` · ${lactationLabels[goat.lactationStatus]}` : ""}</p>
        </div>
        {(goat.rightEarTattoo || goat.leftEarTattoo) && (
          <div className="text-right shrink-0">
            {goat.rightEarTattoo && <p className="text-xs font-mono text-muted-foreground/70">RE {goat.rightEarTattoo}</p>}
            {goat.leftEarTattoo && <p className="text-xs font-mono text-muted-foreground/70">LE {goat.leftEarTattoo}</p>}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function GoatsList() {
  const [statusFilter, setStatusFilter] = useState<ListGoatsStatus | undefined>();
  const [sexFilter, setSexFilter] = useState<ListGoatsSex | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem("herd-view") as ViewMode) || "grid"; } catch { return "grid"; }
  });
  const [sortKey, setSortKey] = useState<"name" | "breed" | "sex" | "age" | "lactation" | "status" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: goats, isLoading } = useListGoats(
    { status: statusFilter, sex: sexFilter },
    { query: { queryKey: getListGoatsQueryKey({ status: statusFilter, sex: sexFilter }) } }
  );

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredGoats = useMemo(() => {
    const base = goats?.filter((goat) => searchQuery === "" || goat.name.toLowerCase().includes(searchQuery.toLowerCase())) ?? [];
    if (!sortKey) return base;
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "breed") {
        cmp = (breedLabels[a.breed] ?? a.breed).localeCompare(breedLabels[b.breed] ?? b.breed);
      } else if (sortKey === "sex") {
        cmp = (a.sex ?? "").localeCompare(b.sex ?? "");
      } else if (sortKey === "age") {
        const aDate = a.dateOfBirth ? new Date(a.dateOfBirth).getTime() : 0;
        const bDate = b.dateOfBirth ? new Date(b.dateOfBirth).getTime() : 0;
        cmp = bDate - aDate;
      } else if (sortKey === "lactation") {
        cmp = (a.lactationStatus ?? "").localeCompare(b.lactationStatus ?? "");
      } else if (sortKey === "status") {
        cmp = (a.herdStatus ?? "").localeCompare(b.herdStatus ?? "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [goats, searchQuery, sortKey, sortDir]);

  const setView = (mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem("herd-view", mode); } catch {}
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-serif font-bold text-foreground mb-2">The Herd</h2>
            <p className="text-muted-foreground">Manage your goats, production records, and health status.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/goats/import">
              <Button variant="outline" className="shadow-sm">
                <Upload className="mr-2 h-4 w-4" />
                Import
              </Button>
            </Link>
            <Link href="/goats/new">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md">
                <Plus className="mr-2 h-4 w-4" />
                Add Goat
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-center bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name..." className="pl-9 bg-background/50 border-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={sexFilter || "all"} onValueChange={(val) => setSexFilter(val === "all" ? undefined : val as ListGoatsSex)}>
              <SelectTrigger className="w-[140px] bg-background/50 border-input">
                <SelectValue placeholder="Sex" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sexes</SelectItem>
                <SelectItem value="doe">Does</SelectItem>
                <SelectItem value="buck">Bucks</SelectItem>
                <SelectItem value="wether">Wethers</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter || "all"} onValueChange={(val) => setStatusFilter(val === "all" ? undefined : val as ListGoatsStatus)}>
              <SelectTrigger className="w-[160px] bg-background/50 border-input">
                <SelectValue placeholder="Herd Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Herd Status</SelectItem>
                <SelectItem value="on-farm">On Farm</SelectItem>
                <SelectItem value="first-freshener">First Freshener</SelectItem>
                <SelectItem value="leased">Leased</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="dead">Dead</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex rounded-lg border border-border overflow-hidden bg-background/50">
              <button
                onClick={() => setView("grid")}
                title="Photo grid"
                className={`px-2.5 py-2 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("compact")}
                title="Compact list"
                className={`px-2.5 py-2 transition-colors border-x border-border ${viewMode === "compact" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("list")}
                title="Table view"
                className={`px-2.5 py-2 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          viewMode === "list" ? (
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              {[1,2,3,4,5].map((i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
                  <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : viewMode === "compact" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1,2,3,4,5,6,7,8].map((i) => (
                <div key={i} className="flex flex-col gap-2 bg-card rounded-xl p-4 border border-border">
                  <Skeleton className="h-48 w-full rounded-lg" />
                  <Skeleton className="h-6 w-3/4 mt-4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          )
        ) : filteredGoats && filteredGoats.length > 0 ? (
          viewMode === "list" ? (
            <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
              <div className="hidden md:grid grid-cols-[2.5rem_1fr] px-4 py-2 bg-muted/50 border-b border-border text-xs uppercase tracking-wide text-muted-foreground font-medium">
                <div />
                <div className="grid grid-cols-7 gap-x-4 ml-4">
                  {(["name", "breed", "sex", "age", "lactation", "status"] as const).map((col, i) => (
                    <button
                      key={col}
                      onClick={() => handleSort(col)}
                      className={`flex items-center gap-1 hover:text-foreground transition-colors text-left ${i === 0 ? "col-span-2" : ""} ${sortKey === col ? "text-foreground" : ""}`}
                    >
                      {col === "lactation" ? "Lactation" : col.charAt(0).toUpperCase() + col.slice(1)}
                      {sortKey === col ? (
                        sortDir === "asc" ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {filteredGoats.map((goat, i) => (
                <div key={goat.id} className="animate-in fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                  <GoatRow goat={goat} />
                </div>
              ))}
            </div>
          ) : viewMode === "compact" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredGoats.map((goat, i) => (
                <div key={goat.id} className="animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 40}ms` }}>
                  <CompactCard goat={goat} />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredGoats.map((goat, i) => (
                <div key={goat.id} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 50}ms` }}>
                  <GoatCard goat={goat} />
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-card/50 rounded-xl border border-dashed border-primary/20">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Filter className="h-8 w-8 text-primary/60" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No goats found</h3>
            <p className="text-muted-foreground max-w-md">We couldn't find any goats matching your current filters. Try adjusting them or add a new goat to the herd.</p>
            <Button variant="outline" className="mt-6" onClick={() => { setSearchQuery(""); setSexFilter(undefined); setStatusFilter(undefined); setSortKey(null); }}>
              Clear Filters
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
