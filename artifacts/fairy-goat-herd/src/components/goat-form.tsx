import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { formatAge } from "@/lib/age";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, GripVertical, Loader2, Plus, Star, X } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Goat } from "@workspace/api-client-react/src/generated/api.schemas";
import { useUpload } from "@workspace/object-storage-web";
import { BREED_SLUGS, getBreedOptions } from "@/lib/breeds";
import { useFarmSettings } from "@/lib/settings";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be less than 50 characters"),
  registeredName: z.string().optional(),
  adgaId: z.string().optional(),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  sex: z.enum(["doe", "buck", "wether"]).optional(),
  damName: z.string().optional(),
  sireName: z.string().optional(),
  maternalGranddamName: z.string().optional(),
  maternalGrandsireName: z.string().optional(),
  paternalGranddamName: z.string().optional(),
  paternalGrandsireName: z.string().optional(),
  damRegNo: z.string().optional(),
  sireRegNo: z.string().optional(),
  maternalGranddamRegNo: z.string().optional(),
  maternalGrandsireRegNo: z.string().optional(),
  paternalGranddamRegNo: z.string().optional(),
  paternalGrandsireRegNo: z.string().optional(),
  breed: z.enum(BREED_SLUGS),
  lactationStatus: z.enum(["milking", "dry", "kid", "retired"]).nullable().optional(),
  breedingStatus: z.enum(["exposed", "serviced", "pregnant"]).nullable().optional(),
  description: z.string().optional(),
  imageUrls: z.array(z.string()).max(4, "Up to 4 photos allowed").default([]),
  herdStatus: z.enum(["dead", "leased", "on-farm", "retired", "sold-registered", "sold-not-registered"]).nullable().optional(),
  leasedBuck: z.boolean().optional(),
  rightEarTattoo: z.string().max(4, "Max 4 characters").optional().transform((v) => (v ? v : null)),
  leftEarTattoo: z.string().max(4, "Max 4 characters").optional().transform((v) => (v ? v : null)),
  rightTailTattoo: z.string().max(4, "Max 4 characters").optional().transform((v) => (v ? v : null)),
  leftTailTattoo: z.string().max(4, "Max 4 characters").optional().transform((v) => (v ? v : null)),
  centerTailTattoo: z.string().max(8, "Max 8 characters").optional().transform((v) => (v ? v : null)),
  eidNumber: z.string().max(50, "Max 50 characters").optional().transform((v) => (v ? v : null)),
});

const TATTOO_LOCATIONS = [
  { field: "rightEarTattoo", label: "Right Ear", placeholder: "E.g., A1B2" },
  { field: "leftEarTattoo", label: "Left Ear", placeholder: "E.g., C3D4" },
  { field: "rightTailTattoo", label: "Right Tail", placeholder: "E.g., E5F6" },
  { field: "leftTailTattoo", label: "Left Tail", placeholder: "E.g., G7H8" },
  { field: "centerTailTattoo", label: "Center Tail", placeholder: "E.g., AB1CD2EF", maxLength: 8 },
] as const;

type TattooField = (typeof TATTOO_LOCATIONS)[number]["field"];

type FormValues = z.infer<typeof formSchema>;

interface GoatFormProps {
  defaultValues?: Partial<Goat>;
  onSubmit: (data: FormValues) => void;
  isSubmitting?: boolean;
}

function SortablePhoto({
  url,
  index,
  isCover,
  onRemove,
  onMakeCover,
}: {
  url: string;
  index: number;
  isCover: boolean;
  onRemove: () => void;
  onMakeCover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: url,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative h-24 w-24 shrink-0 rounded-lg border ${
        isCover ? "border-primary ring-2 ring-primary/40" : "border-border"
      } ${isDragging ? "z-10 shadow-lg" : ""}`}
    >
      <img
        src={url}
        alt={isCover ? "Cover photo" : `Photo ${index + 1}`}
        className="h-full w-full rounded-lg object-cover"
      />

      {isCover && (
        <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
          <Star className="h-2.5 w-2.5 fill-current" /> Cover
        </span>
      )}

      <button
        type="button"
        aria-label={`Reorder photo ${index + 1}`}
        className="absolute bottom-1 left-1 cursor-grab touch-none rounded-md bg-background/80 p-0.5 text-muted-foreground shadow-sm hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {!isCover && (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={onMakeCover}
          aria-label={`Make photo ${index + 1} the cover`}
          title="Make cover"
          className="absolute bottom-1 right-1 h-6 w-6 rounded-full shadow-sm"
        >
          <Star className="h-3.5 w-3.5" />
        </Button>
      )}

      <Button
        type="button"
        variant="destructive"
        size="icon"
        onClick={onRemove}
        aria-label={`Remove photo ${index + 1}`}
        className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-md"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function ImageSlots({ value, onChange }: { value: string[]; onChange: (urls: string[]) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading, progress, error } = useUpload({
    onSuccess: (response) => {
      onChange([...value, `/api/storage${response.objectPath}`].slice(0, 4));
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    ref: React.RefObject<HTMLInputElement | null>,
  ) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    if (ref.current) ref.current.value = "";
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const makeCover = (index: number) => {
    if (index <= 0) return;
    const next = value.slice();
    const [moved] = next.splice(index, 1);
    next.unshift(moved);
    onChange(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = value.indexOf(active.id as string);
    const newIndex = value.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(value, oldIndex, newIndex));
  };

  const canAddMore = value.length < 4;

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={value} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-3">
                {value.map((url, index) => (
                  <SortablePhoto
                    key={url}
                    url={url}
                    index={index}
                    isCover={index === 0}
                    onRemove={() => removeAt(index)}
                    onMakeCover={() => makeCover(index)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {value.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Drag to reorder. The first photo is the cover shown on the herd list and dashboard.
            </p>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, fileInputRef)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileSelect(e, cameraInputRef)}
      />

      {canAddMore && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="gap-2"
          >
            {isUploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {progress}%</>
            ) : (
              <><Plus className="h-4 w-4" /> Add Photo</>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isUploading}
            className="gap-2"
          >
            <Camera className="h-4 w-4" /> Take Photo
          </Button>
          <span className="text-xs text-muted-foreground">{value.length}/4</span>
        </div>
      )}

      {!canAddMore && (
        <p className="text-xs text-muted-foreground">Maximum of 4 photos reached. Remove one to add another.</p>
      )}

      {error && (
        <p className="text-sm font-medium text-destructive">{error.message}</p>
      )}
    </div>
  );
}

export function GoatForm({ defaultValues, onSubmit, isSubmitting = false }: GoatFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: defaultValues?.name || "",
      registeredName: defaultValues?.registeredName || "",
      adgaId: defaultValues?.adgaId || "",
      dateOfBirth: defaultValues?.dateOfBirth ? new Date(defaultValues.dateOfBirth).toISOString().slice(0, 10) : "",
      sex: (defaultValues?.sex as "doe" | "buck" | "wether" | undefined) || undefined,
      damName: defaultValues?.damName || "",
      sireName: defaultValues?.sireName || "",
      maternalGranddamName: defaultValues?.maternalGranddamName || "",
      maternalGrandsireName: defaultValues?.maternalGrandsireName || "",
      paternalGranddamName: defaultValues?.paternalGranddamName || "",
      paternalGrandsireName: defaultValues?.paternalGrandsireName || "",
      damRegNo: defaultValues?.damRegNo || "",
      sireRegNo: defaultValues?.sireRegNo || "",
      maternalGranddamRegNo: defaultValues?.maternalGranddamRegNo || "",
      maternalGrandsireRegNo: defaultValues?.maternalGrandsireRegNo || "",
      paternalGranddamRegNo: defaultValues?.paternalGranddamRegNo || "",
      paternalGrandsireRegNo: defaultValues?.paternalGrandsireRegNo || "",
      breed: defaultValues?.breed || "mixed",
      lactationStatus: (defaultValues?.sex === "buck" || defaultValues?.sex === "wether")
        ? ((defaultValues?.lactationStatus as "milking" | "dry" | "kid" | "retired" | null | undefined) || null)
        : (defaultValues?.lactationStatus as "milking" | "dry" | "kid" | "retired" | undefined) || "milking",
      breedingStatus: (defaultValues?.sex === "buck" || defaultValues?.sex === "wether")
        ? null
        : (defaultValues?.breedingStatus as "exposed" | "serviced" | "pregnant" | null | undefined) ?? null,
      description: defaultValues?.description || "",
      imageUrls: defaultValues?.imageUrls && defaultValues.imageUrls.length > 0
        ? defaultValues.imageUrls
        : defaultValues?.imageUrl
          ? [defaultValues.imageUrl]
          : [],
      herdStatus: (defaultValues?.herdStatus as "dead" | "leased" | "on-farm" | "retired" | "sold-registered" | "sold-not-registered" | null | undefined) ?? "on-farm",
      leasedBuck: defaultValues?.leasedBuck ?? false,
      rightEarTattoo: defaultValues?.rightEarTattoo || "",
      leftEarTattoo: defaultValues?.leftEarTattoo || "",
      rightTailTattoo: defaultValues?.rightTailTattoo || "",
      leftTailTattoo: defaultValues?.leftTailTattoo || "",
      centerTailTattoo: defaultValues?.centerTailTattoo || "",
      eidNumber: defaultValues?.eidNumber || "",
    },
  });

  const [activeTattooFields, setActiveTattooFields] = useState<TattooField[]>(() =>
    TATTOO_LOCATIONS.filter((loc) => defaultValues?.[loc.field]).map((loc) => loc.field),
  );

  const addTattooLocation = (field: TattooField) => {
    setActiveTattooFields((prev) => (prev.includes(field) ? prev : [...prev, field]));
  };

  const removeTattooLocation = (field: TattooField) => {
    form.setValue(field, "");
    setActiveTattooFields((prev) => prev.filter((f) => f !== field));
  };

  const availableTattooLocations = TATTOO_LOCATIONS.filter((loc) => !activeTattooFields.includes(loc.field));

  const { enabledBreeds } = useFarmSettings();
  // Union-in this goat's current breed so an edited goat whose breed is no
  // longer enabled still shows (and keeps) its stored breed.
  const breedOptions = getBreedOptions(enabledBreeds, defaultValues?.breed ?? null);

  const dateOfBirth = form.watch("dateOfBirth");
  const damName = form.watch("damName");
  const sireName = form.watch("sireName");
  const sex = form.watch("sex");
  const showBlankLactation = sex === "buck" || sex === "wether";
  const isSexInitialized = useRef(false);

  useEffect(() => {
    if (!isSexInitialized.current) {
      isSexInitialized.current = true;
      return;
    }
    if (sex === "buck" || sex === "wether") {
      form.setValue("lactationStatus", null);
      form.setValue("breedingStatus", null);
    } else if (sex === "doe" && !form.getValues("lactationStatus")) {
      form.setValue("lactationStatus", "milking");
    }
    if (sex !== "buck") {
      form.setValue("leasedBuck", false);
    }
  }, [sex, form]);

  useEffect(() => {
    if (!defaultValues) {
      return;
    }

    if (damName && defaultValues.maternalGranddamName && !form.getValues("maternalGranddamName")) {
      form.setValue("maternalGranddamName", defaultValues.maternalGranddamName);
    }

    if (damName && defaultValues.maternalGrandsireName && !form.getValues("maternalGrandsireName")) {
      form.setValue("maternalGrandsireName", defaultValues.maternalGrandsireName);
    }

    if (sireName && defaultValues.paternalGranddamName && !form.getValues("paternalGranddamName")) {
      form.setValue("paternalGranddamName", defaultValues.paternalGranddamName);
    }

    if (sireName && defaultValues.paternalGrandsireName && !form.getValues("paternalGrandsireName")) {
      form.setValue("paternalGrandsireName", defaultValues.paternalGrandsireName);
    }
  }, [damName, sireName, defaultValues, form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Identity</h3>
            <p className="text-sm text-muted-foreground">Barn name, registered name, and ADGA registration number.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Barn Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., Clover, Hazel, Juniper" {...field} className="bg-background/50" />
                  </FormControl>
                  <FormDescription>The everyday name used in the barn.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="registeredName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registered Name</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., Maple Hill Clover's Star" {...field} className="bg-background/50" />
                  </FormControl>
                  <FormDescription>Full registered name on ADGA papers.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="adgaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ADGA Registration #</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., AN1234567" {...field} className="bg-background/50" />
                  </FormControl>
                  <FormDescription>American Dairy Goat Association registration ID.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateOfBirth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Birth <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input type="date" {...field} className="bg-background/50" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sex"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sex</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background/50">
                        <SelectValue placeholder="Select sex" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="doe">Doe (Female)</SelectItem>
                      <SelectItem value="buck">Buck (Male)</SelectItem>
                      <SelectItem value="wether">Wether (Neutered Male)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Whether this goat is a doe, a buck, or a wether.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {sex === "buck" && (
            <FormField
              control={form.control}
              name="leasedBuck"
              render={({ field }) => (
                <FormItem className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 p-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      className="mt-0.5"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer font-medium">Breeding Leased Buck</FormLabel>
                    <FormDescription>
                      This buck is on a breeding lease. He will not be counted in herd totals on the overview.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="breed"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Breed</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue placeholder="Select breed" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {breedOptions.map((breed) => (
                      <SelectItem key={breed.slug} value={breed.slug}>
                        {breed.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lactationStatus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lactation Status</FormLabel>
                <Select onValueChange={(val) => field.onChange(val === "_none" ? null : val)} value={field.value ?? (showBlankLactation ? "_none" : "")}>
                  <FormControl>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue placeholder="Select lactation status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {showBlankLactation && (
                      <SelectItem value="_none">— Not applicable —</SelectItem>
                    )}
                    <SelectItem value="milking">Milking</SelectItem>
                    <SelectItem value="dry">Dry</SelectItem>
                    <SelectItem value="kid">Kid</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {!showBlankLactation && (
            <FormField
              control={form.control}
              name="breedingStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Breeding Status</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(val === "_none" ? null : val)}
                    value={field.value ?? "_none"}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background/50">
                        <SelectValue placeholder="Select breeding status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      <SelectItem value="exposed">Exposed (with buck)</SelectItem>
                      <SelectItem value="serviced">Serviced (cover witnessed)</SelectItem>
                      <SelectItem value="pregnant">Pregnant</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="herdStatus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Herd Status</FormLabel>
                <Select
                  onValueChange={(val) => field.onChange(val === "_none" ? null : val)}
                  value={field.value ?? "_none"}
                >
                  <FormControl>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue placeholder="Select herd status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="_none">— Not set —</SelectItem>
                    <SelectItem value="dead">Dead</SelectItem>
                    <SelectItem value="leased">Leased</SelectItem>
                    <SelectItem value="on-farm">On Farm</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                    <SelectItem value="sold-registered">Sold-Registered</SelectItem>
                    <SelectItem value="sold-not-registered">Sold-Not Registered</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="imageUrls"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Photos (Optional)</FormLabel>
              <FormDescription>Add up to 4 photos. Each image must be 5 MB or smaller.</FormDescription>
              <ImageSlots value={field.value ?? []} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-serif text-lg font-semibold text-foreground">Calculated Age</h3>
              <p className="text-sm text-muted-foreground">Age is derived automatically from the date of birth.</p>
            </div>
            <div className="text-2xl font-serif font-bold text-primary">
              {dateOfBirth ? formatAge(dateOfBirth) : "—"}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Breeding Information</h3>
            <p className="text-sm text-muted-foreground">Record parents and grandparents for pedigree tracking.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {([
              { nameField: "damName", regField: "damRegNo", label: "Dam", namePlaceholder: "Mother's name" },
              { nameField: "sireName", regField: "sireRegNo", label: "Sire", namePlaceholder: "Father's name" },
              { nameField: "maternalGranddamName", regField: "maternalGranddamRegNo", label: "Maternal Granddam", namePlaceholder: "Dam's dam" },
              { nameField: "maternalGrandsireName", regField: "maternalGrandsireRegNo", label: "Maternal Grandsire", namePlaceholder: "Dam's sire" },
              { nameField: "paternalGranddamName", regField: "paternalGranddamRegNo", label: "Paternal Granddam", namePlaceholder: "Sire's dam" },
              { nameField: "paternalGrandsireName", regField: "paternalGrandsireRegNo", label: "Paternal Grandsire", namePlaceholder: "Sire's sire" },
            ] as const).map((ancestor) => (
              <div key={ancestor.nameField} className="space-y-3 rounded-lg border border-border/60 bg-background/30 p-3">
                <FormField
                  control={form.control}
                  name={ancestor.nameField}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{ancestor.label}</FormLabel>
                      <FormControl>
                        <Input placeholder={ancestor.namePlaceholder} {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={ancestor.regField}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Reg No.</FormLabel>
                      <FormControl>
                        <Input placeholder="Registration number" {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Identification</h3>
            <p className="text-sm text-muted-foreground">Tattoo locations and microchip/EID for this goat.</p>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-foreground">Tattoo</h4>
              <p className="text-xs text-muted-foreground">Add the locations this goat is tattooed in (up to 4 characters each).</p>
            </div>

            {activeTattooFields.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No tattoo locations added yet.</p>
            )}

            {activeTattooFields.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {TATTOO_LOCATIONS.filter((loc) => activeTattooFields.includes(loc.field)).map((loc) => (
                  <FormField
                    key={loc.field}
                    control={form.control}
                    name={loc.field}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>{loc.label}</FormLabel>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTattooLocation(loc.field)}
                            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3 w-3 mr-1" /> Remove
                          </Button>
                        </div>
                        <FormControl>
                          <Input
                            placeholder={loc.placeholder}
                            maxLength={"maxLength" in loc ? loc.maxLength : 4}
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            className="bg-background/50 uppercase"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            )}

            {availableTattooLocations.length > 0 && (
              <Select value="" onValueChange={(v) => addTattooLocation(v as TattooField)}>
                <SelectTrigger className="w-full md:w-64 bg-background/50">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Plus className="h-4 w-4" /> Add tattoo location
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {availableTattooLocations.map((loc) => (
                    <SelectItem key={loc.field} value={loc.field}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-4 border-t border-border/60 pt-4">
            <div>
              <h4 className="text-sm font-medium text-foreground">Microchip</h4>
              <p className="text-xs text-muted-foreground">Optional electronic ID (EID) number.</p>
            </div>
            <FormField
              control={form.control}
              name="eidNumber"
              render={({ field }) => (
                <FormItem className="md:max-w-md">
                  <FormLabel>EID Number</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., 982000123456789" maxLength={50} {...field} value={field.value ?? ""} className="bg-background/50 font-mono" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Herd Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Temperament, kidding history, feed needs, health notes..." className="resize-none min-h-[120px] bg-background/50" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="sticky bottom-16 z-20 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur flex justify-end md:static md:bottom-auto md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pt-4 md:backdrop-blur-none">
          <Button type="submit" disabled={isSubmitting} size="lg" className="w-full sm:w-auto min-w-[200px] shadow-md">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {defaultValues ? "Update Record" : "Add to Herd"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
