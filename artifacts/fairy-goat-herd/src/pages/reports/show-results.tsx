import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Check, ChevronsUpDown, Loader2, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetShowQueryKey,
  getListGoatsQueryKey,
  getListShowsQueryKey,
  useCreateShow,
  useCreateShowResults,
  useDeleteShow,
  useDeleteShowResult,
  useGetShow,
  useListGoats,
  useListShows,
  useUpdateShow,
  useUpdateShowResult,
} from "@workspace/api-client-react";
import type { Goat, ShowResult, ShowWithResults } from "@workspace/api-client-react/src/generated/api.schemas";
import { formatDate } from "@/lib/date";
import { useIsManager } from "@/lib/auth";

const PLACEMENTS = [
  "1st Place",
  "2nd Place",
  "3rd Place",
  "4th Place",
  "Best in Show",
  "Reserve Champion",
  "Other",
];

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatDate(new Date(iso), { month: "short", day: "numeric", year: "numeric" });
}

/** Convert an ISO timestamp to the yyyy-mm-dd value a date input expects. */
function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

interface DraftResult {
  key: number;
  goatId: number;
  judgeName: string;
  classDivision: string;
  placement: string;
  awardRibbon: string;
  notes: string;
}

interface EditResultState {
  resultId: number;
  goatId: number;
  judgeName: string;
  classDivision: string;
  placement: string;
  awardRibbon: string;
  notes: string;
}

/** Searchable picker of the farm's on-farm goats. */
function GoatPicker({
  goats,
  onPick,
  disabled,
  triggerLabel,
}: {
  goats: Goat[];
  onPick: (goat: Goat) => void;
  disabled?: boolean;
  /** Custom trigger text; defaults to the "add a result" affordance. */
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" disabled={disabled} className="w-full sm:w-72 justify-between">
          {triggerLabel ? (
            <span className="truncate">{triggerLabel}</span>
          ) : (
            <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add a goat's result…</span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search goats…" />
          <CommandList>
            <CommandEmpty>No goat found.</CommandEmpty>
            <CommandGroup>
              {goats.map((goat) => (
                <CommandItem
                  key={goat.id}
                  value={goat.name}
                  onSelect={() => {
                    onPick(goat);
                    setOpen(false);
                  }}
                >
                  {goat.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ShowHeaderForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial?: Partial<ShowWithResults>;
  onSave: (data: { name: string; location: string; showDate: string; notes: string }) => void;
  onCancel?: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [showDate, setShowDate] = useState(toDateInputValue(initial?.showDate) || new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const canSave = name.trim().length > 0 && showDate.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="show-name">Show Name</Label>
          <Input id="show-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. County Fair Dairy Goat Show" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="show-location">Location</Label>
          <Input id="show-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Fairgrounds, Springfield" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="show-date">Date of Show</Label>
          <Input id="show-date" type="date" value={showDate} onChange={(e) => setShowDate(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="show-notes">Notes (optional)</Label>
        <Textarea id="show-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about this show" />
      </div>
      <div className="flex gap-2">
        <Button
          disabled={!canSave || isSaving}
          onClick={() => onSave({ name: name.trim(), location: location.trim(), showDate: new Date(`${showDate}T12:00:00`).toISOString(), notes: notes.trim() })}
        >
          {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save Show"}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button>
        )}
      </div>
    </div>
  );
}

/** The results editor for one saved show: existing rows + new draft rows. */
function ShowEditor({ showId, onBack }: { showId: number; onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isManager = useIsManager();
  const [drafts, setDrafts] = useState<DraftResult[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<EditResultState | null>(null);

  const { data: show, isLoading } = useGetShow(showId, {
    query: { queryKey: getGetShowQueryKey(showId) },
  });
  const { data: goats } = useListGoats(
    { status: "on-farm" },
    { query: { queryKey: getListGoatsQueryKey({ status: "on-farm" }) } },
  );
  const sortedGoats = useMemo(
    () => [...(goats ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [goats],
  );
  const goatName = (id: number) => goats?.find((g) => g.id === id)?.name ?? `Goat #${id}`;

  const updateShow = useUpdateShow();
  const deleteShow = useDeleteShow();
  const createResults = useCreateShowResults();
  const deleteResult = useDeleteShowResult();
  const updateResult = useUpdateShowResult();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(showId) });
    queryClient.invalidateQueries({ queryKey: getListShowsQueryKey() });
  };

  const addDraft = (goat: Goat) => {
    setDrafts((prev) => [
      ...prev,
      { key: nextKey, goatId: goat.id, judgeName: "", classDivision: "", placement: "", awardRibbon: "", notes: "" },
    ]);
    setNextKey((k) => k + 1);
  };

  const updateDraft = (key: number, patch: Partial<DraftResult>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const saveDrafts = () => {
    createResults.mutate(
      {
        id: showId,
        data: {
          results: drafts.map((d) => ({
            goatId: d.goatId,
            judgeName: d.judgeName.trim() || undefined,
            classDivision: d.classDivision.trim() || undefined,
            placement: d.placement.trim() || undefined,
            awardRibbon: d.awardRibbon.trim() || undefined,
            notes: d.notes.trim() || undefined,
          })),
        },
      },
      {
        onSuccess: (created) => {
          setDrafts([]);
          refresh();
          toast({ title: "Results saved", description: `Recorded ${created.length} result${created.length === 1 ? "" : "s"} for this show.` });
        },
        onError: () => {
          toast({ title: "Save failed", description: "The results could not be saved. Please try again.", variant: "destructive" });
        },
      },
    );
  };

  const startEditResult = (r: ShowResult) => {
    setEditingResult({
      resultId: r.id,
      goatId: r.goatId,
      judgeName: r.judgeName ?? "",
      classDivision: r.classDivision ?? "",
      placement: r.placement ?? "",
      awardRibbon: r.awardRibbon ?? "",
      notes: r.notes ?? "",
    });
  };

  const updateEditing = (patch: Partial<EditResultState>) => {
    setEditingResult((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const saveEditResult = () => {
    if (!editingResult) return;
    updateResult.mutate(
      {
        id: showId,
        resultId: editingResult.resultId,
        data: {
          goatId: editingResult.goatId,
          judgeName: editingResult.judgeName.trim() || null,
          classDivision: editingResult.classDivision.trim() || null,
          placement: editingResult.placement.trim() || null,
          awardRibbon: editingResult.awardRibbon.trim() || null,
          notes: editingResult.notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setEditingResult(null);
          refresh();
          toast({ title: "Result updated" });
        },
        onError: () => {
          toast({ title: "Update failed", description: "The result could not be updated. Please try again.", variant: "destructive" });
        },
      },
    );
  };

  const handleDeleteResult = (resultId: number) => {
    deleteResult.mutate(
      { id: showId, resultId },
      {
        onSuccess: () => {
          refresh();
          toast({ title: "Result removed" });
        },
        onError: () => {
          toast({ title: "Removal failed", description: "The result could not be removed.", variant: "destructive" });
        },
      },
    );
  };

  const handleDeleteShow = () => {
    deleteShow.mutate(
      { id: showId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListShowsQueryKey() });
          toast({ title: "Show deleted", description: "The show and all of its results were removed." });
          onBack();
        },
        onError: () => {
          toast({ title: "Delete failed", description: "The show could not be deleted.", variant: "destructive" });
          setDeleteDialogOpen(false);
        },
      },
    );
  };

  if (isLoading || !show) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground hover:text-foreground -ml-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> All Shows
      </Button>

      <Card className="border-primary/10">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-serif text-xl">{show.name}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {show.location ? `${show.location} · ` : ""}{shortDate(show.showDate)}
              </p>
              {show.notes && <p className="mt-1 text-sm text-muted-foreground">{show.notes}</p>}
            </div>
            {isManager && !isEditingHeader && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditingHeader(true)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit Show
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        {isEditingHeader && (
          <CardContent>
            <ShowHeaderForm
              initial={show}
              isSaving={updateShow.isPending}
              onCancel={() => setIsEditingHeader(false)}
              onSave={(data) => {
                updateShow.mutate(
                  { id: showId, data: { name: data.name, location: data.location || null, showDate: data.showDate, notes: data.notes || null } },
                  {
                    onSuccess: () => {
                      setIsEditingHeader(false);
                      refresh();
                      toast({ title: "Show updated" });
                    },
                    onError: () => {
                      toast({ title: "Update failed", description: "The show could not be updated.", variant: "destructive" });
                    },
                  },
                );
              }}
            />
          </CardContent>
        )}
      </Card>

      <Card className="border-primary/10">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Results</CardTitle>
          <p className="text-sm text-muted-foreground">
            One row per judge and class — a goat can appear multiple times.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {show.results.length === 0 && drafts.length === 0 && (
            <p className="text-sm text-muted-foreground">No results recorded for this show yet.</p>
          )}

          {show.results.length > 0 && (
            <div className="space-y-2">
              {show.results.map((r) =>
                editingResult && editingResult.resultId === r.id ? (
                  <div key={r.id} className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Goat</Label>
                      <GoatPicker
                        goats={sortedGoats}
                        onPick={(goat) => updateEditing({ goatId: goat.id })}
                        disabled={updateResult.isPending}
                        triggerLabel={goatName(editingResult.goatId)}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Judge Name</Label>
                        <Input value={editingResult.judgeName} onChange={(e) => updateEditing({ judgeName: e.target.value })} placeholder="Judge" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Class / Division</Label>
                        <Input value={editingResult.classDivision} onChange={(e) => updateEditing({ classDivision: e.target.value })} placeholder="e.g. Senior Doe" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Placement</Label>
                        <Select value={editingResult.placement || undefined} onValueChange={(v) => updateEditing({ placement: v })}>
                          <SelectTrigger><SelectValue placeholder="Pick placement" /></SelectTrigger>
                          <SelectContent>
                            {(PLACEMENTS.includes(editingResult.placement) || !editingResult.placement
                              ? PLACEMENTS
                              : [editingResult.placement, ...PLACEMENTS]
                            ).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Award / Ribbon</Label>
                        <Input value={editingResult.awardRibbon} onChange={(e) => updateEditing({ awardRibbon: e.target.value })} placeholder="e.g. Blue ribbon" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Notes (optional)</Label>
                      <Input value={editingResult.notes} onChange={(e) => updateEditing({ notes: e.target.value })} placeholder="Notes" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEditResult} disabled={updateResult.isPending}>
                        {updateResult.isPending ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                        ) : (
                          <><Check className="mr-2 h-4 w-4" /> Save Changes</>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingResult(null)} disabled={updateResult.isPending}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <span className="font-medium">{r.goatName}</span>
                    {r.placement && <Badge variant="secondary">{r.placement}</Badge>}
                    {r.classDivision && <span className="text-muted-foreground">{r.classDivision}</span>}
                    {r.judgeName && <span className="text-muted-foreground">Judge: {r.judgeName}</span>}
                    {r.awardRibbon && <span className="text-muted-foreground">Award: {r.awardRibbon}</span>}
                    {r.notes && <span className="text-muted-foreground italic">{r.notes}</span>}
                    {isManager && (
                      <span className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEditResult(r)}
                          disabled={updateResult.isPending}
                          aria-label="Edit result"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteResult(r.id)}
                          disabled={deleteResult.isPending}
                          aria-label="Delete result"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    )}
                  </div>
                ),
              )}
            </div>
          )}

          {isManager && (
            <>
              {drafts.map((d) => (
                <div key={d.key} className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{goatName(d.goatId)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Judge Name</Label>
                      <Input value={d.judgeName} onChange={(e) => updateDraft(d.key, { judgeName: e.target.value })} placeholder="Judge" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Class / Division</Label>
                      <Input value={d.classDivision} onChange={(e) => updateDraft(d.key, { classDivision: e.target.value })} placeholder="e.g. Senior Doe" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Placement</Label>
                      <Select value={d.placement || undefined} onValueChange={(v) => updateDraft(d.key, { placement: v })}>
                        <SelectTrigger><SelectValue placeholder="Pick placement" /></SelectTrigger>
                        <SelectContent>
                          {PLACEMENTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Award / Ribbon</Label>
                      <Input value={d.awardRibbon} onChange={(e) => updateDraft(d.key, { awardRibbon: e.target.value })} placeholder="e.g. Blue ribbon" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes (optional)</Label>
                    <Input value={d.notes} onChange={(e) => updateDraft(d.key, { notes: e.target.value })} placeholder="Notes" />
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <GoatPicker goats={sortedGoats} onPick={addDraft} disabled={createResults.isPending} />
                {drafts.length > 0 && (
                  <Button onClick={saveDrafts} disabled={createResults.isPending}>
                    {createResults.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                    ) : (
                      <><Check className="mr-2 h-4 w-4" /> Save {drafts.length} Result{drafts.length === 1 ? "" : "s"}</>
                    )}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Delete this show?</DialogTitle>
            <DialogDescription>
              This removes {show.name} and every result recorded for it. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteShow} disabled={deleteShow.isPending}>
              {deleteShow.isPending ? "Deleting…" : "Delete Show"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ShowResults() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isManager = useIsManager();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const selectedId = Number(new URLSearchParams(search).get("show")) || null;
  const [isCreating, setIsCreating] = useState(false);

  const { data: shows, isLoading } = useListShows({
    query: { queryKey: getListShowsQueryKey() },
  });
  const createShow = useCreateShow();

  if (selectedId) {
    return (
      <Layout>
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Show Results</h1>
          <p className="text-muted-foreground text-sm">Record which goats entered, how each judge placed them, and what they won.</p>
        </div>
        <ShowEditor showId={selectedId} onBack={() => setLocation("/reports/show-results")} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Show Results</h1>
          <p className="text-muted-foreground text-sm">Record which goats entered, how each judge placed them, and what they won.</p>
        </div>
        {isManager && !isCreating && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Show
          </Button>
        )}
      </div>

      {isCreating && (
        <Card className="mb-6 border-primary/10">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">New Show</CardTitle>
          </CardHeader>
          <CardContent>
            <ShowHeaderForm
              isSaving={createShow.isPending}
              onCancel={() => setIsCreating(false)}
              onSave={(data) => {
                createShow.mutate(
                  { data: { name: data.name, location: data.location || undefined, showDate: data.showDate, notes: data.notes || undefined } },
                  {
                    onSuccess: (created) => {
                      setIsCreating(false);
                      queryClient.invalidateQueries({ queryKey: getListShowsQueryKey() });
                      toast({ title: "Show saved", description: "Now add each goat's results below." });
                      setLocation(`/reports/show-results?show=${created.id}`);
                    },
                    onError: () => {
                      toast({ title: "Save failed", description: "The show could not be saved. Please try again.", variant: "destructive" });
                    },
                  },
                );
              }}
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : !shows || shows.length === 0 ? (
        !isCreating && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Trophy className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium text-foreground">No shows recorded yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isManager ? "Use “New Show” to record your first show's results." : "Show results recorded by a manager will appear here."}
              </p>
            </CardContent>
          </Card>
        )
      ) : (
        <div className="space-y-3">
          {shows.map((show) => (
            <Card
              key={show.id}
              className="cursor-pointer border-primary/10 transition-all hover:border-primary/30 hover:shadow-md"
              onClick={() => setLocation(`/reports/show-results?show=${show.id}`)}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Trophy className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-serif font-semibold text-foreground">{show.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {show.location ? `${show.location} · ` : ""}{shortDate(show.showDate)}
                  </p>
                </div>
                <Button variant="outline" size="sm">{isManager ? "Open / Edit" : "View"}</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
