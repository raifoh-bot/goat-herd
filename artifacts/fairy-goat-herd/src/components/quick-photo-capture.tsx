import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Camera, ImagePlus, Loader2, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetBreedBreakdownQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetGoatQueryKey,
  getListGoatsQueryKey,
  useAddGoatPhoto,
  useListGoats,
  useSetGoatDefaultPhoto,
} from "@workspace/api-client-react";
import type { Goat } from "@workspace/api-client-react/src/generated/api.schemas";
import { useUpload } from "@workspace/object-storage-web";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useIsManager } from "@/lib/auth";
import { breedLabels } from "@/lib/breeds";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 5_242_880; // 5 MB
const MAX_PHOTOS = 4;

type Step = "capture" | "pick";

function photoCount(goat: Goat): number {
  if (goat.imageUrls && goat.imageUrls.length > 0) return goat.imageUrls.length;
  return goat.imageUrl ? 1 : 0;
}

export function QuickPhotoCapture() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("capture");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: goats = [] } = useListGoats(undefined, {
    query: { queryKey: getListGoatsQueryKey(), enabled: open },
  });

  const { uploadFile } = useUpload();
  const addGoatPhoto = useAddGoatPhoto();
  const setGoatDefaultPhoto = useSetGoatDefaultPhoto();
  const isManager = useIsManager();

  const filteredGoats = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return goats;
    return goats.filter(
      (g) =>
        g.name.toLowerCase().includes(term) ||
        (breedLabels[g.breed] ?? g.breed).toLowerCase().includes(term),
    );
  }, [goats, search]);

  const resetState = () => {
    setStep("capture");
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileError(null);
    setSearch("");
    setSelectedId(null);
    setSaveError(null);
    setSetAsDefault(false);
    setIsSaving(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (isSaving) return;
    setOpen(next);
    if (!next) resetState();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;

    if (!picked.type.startsWith("image/")) {
      setFileError("Please choose an image file.");
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setFileError("That photo is larger than the 5 MB limit. Try a smaller one.");
      return;
    }

    setFileError(null);
    setFile(picked);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(picked));
    setStep("pick");
  };

  const handleConfirm = async () => {
    if (!file || selectedId == null) return;
    const goat = goats.find((g) => g.id === selectedId);
    if (!goat) return;

    if (photoCount(goat) >= MAX_PHOTOS) {
      setSaveError(`${goat.name} already has the maximum of 4 photos.`);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const uploaded = await uploadFile(file);
      if (!uploaded) {
        setSaveError("The photo could not be uploaded. Please try again.");
        setIsSaving(false);
        return;
      }

      const imageUrl = `/api/storage${uploaded.objectPath}`;
      let updated = await addGoatPhoto.mutateAsync({ id: goat.id, data: { imageUrl } });

      // Managers can mark the just-added photo as the goat's main photo. The
      // new photo is appended last, so its index is the final position.
      let madeDefault = false;
      if (isManager && setAsDefault) {
        const newIndex = Math.max(0, (updated.imageUrls?.length ?? 1) - 1);
        try {
          updated = await setGoatDefaultPhoto.mutateAsync({ id: goat.id, data: { index: newIndex } });
          madeDefault = true;
        } catch {
          // The photo was still added; surface the partial success below rather
          // than failing the whole flow.
          madeDefault = false;
        }
      }

      queryClient.setQueryData(getGetGoatQueryKey(goat.id), updated);
      queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetBreedBreakdownQueryKey() });

      toast({
        title: "Photo added",
        description:
          isManager && setAsDefault
            ? madeDefault
              ? `Added a new photo to ${updated.name} and set it as the main photo.`
              : `Added a new photo to ${updated.name}, but couldn't set it as the main photo.`
            : `Added a new photo to ${updated.name}.`,
        action: (
          <ToastAction altText={`View ${updated.name}`} onClick={() => setLocation(`/goats/${goat.id}`)}>
            View
          </ToastAction>
        ),
      });

      setOpen(false);
      resetState();
    } catch {
      setSaveError("Something went wrong saving the photo. Please try again.");
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5 text-sm font-medium text-sidebar-foreground/90 transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Camera className="h-4 w-4" />
        Quick Photo
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{step === "capture" ? "Quick Photo" : "Which goat?"}</DialogTitle>
            <DialogDescription>
              {step === "capture"
                ? "Snap or pick a photo, then choose the goat it belongs to."
                : "Pick the goat to add this photo to."}
            </DialogDescription>
          </DialogHeader>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {step === "capture" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 py-12 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50 hover:text-foreground"
              >
                <Camera className="h-10 w-10" />
                <span className="text-sm font-medium">Tap to take a photo</span>
              </button>
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => libraryInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" /> Choose from library
              </Button>
              {fileError && <p className="text-sm font-medium text-destructive">{fileError}</p>}
            </div>
          )}

          {step === "pick" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Selected photo preview"
                    className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover"
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  disabled={isSaving}
                  onClick={() => {
                    setStep("capture");
                    setSelectedId(null);
                    setSaveError(null);
                  }}
                >
                  <X className="h-4 w-4" /> Change photo
                </Button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or breed…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  disabled={isSaving}
                />
              </div>

              <ScrollArea className="h-56 rounded-lg border border-border">
                {filteredGoats.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">No goats found.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredGoats.map((goat) => {
                      const count = photoCount(goat);
                      const isFull = count >= MAX_PHOTOS;
                      const isSelected = selectedId === goat.id;

                      const row = (
                        <button
                          type="button"
                          disabled={isFull || isSaving}
                          onClick={() => setSelectedId(goat.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors",
                            isFull
                              ? "cursor-not-allowed opacity-50"
                              : "hover:bg-muted/50",
                            isSelected && "bg-primary/10",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{goat.name}</p>
                            <p className="truncate text-xs text-muted-foreground capitalize">
                              {breedLabels[goat.breed] ?? goat.breed}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 text-xs font-medium",
                              isFull ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {count}/{MAX_PHOTOS}
                          </span>
                        </button>
                      );

                      if (isFull) {
                        return (
                          <Tooltip key={goat.id}>
                            <TooltipTrigger asChild>
                              <div>{row}</div>
                            </TooltipTrigger>
                            <TooltipContent>Already has the maximum of 4 photos</TooltipContent>
                          </Tooltip>
                        );
                      }

                      return <div key={goat.id}>{row}</div>;
                    })}
                  </div>
                )}
              </ScrollArea>

              {isManager && (
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
                  <Checkbox
                    checked={setAsDefault}
                    onCheckedChange={(checked) => setSetAsDefault(checked === true)}
                    disabled={isSaving}
                  />
                  <span className="font-medium text-foreground">Make this the main photo</span>
                </label>
              )}

              {saveError && <p className="text-sm font-medium text-destructive">{saveError}</p>}

              <Button
                type="button"
                className="w-full gap-2"
                disabled={selectedId == null || isSaving}
                onClick={handleConfirm}
              >
                {isSaving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                ) : (
                  <>Add Photo</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
