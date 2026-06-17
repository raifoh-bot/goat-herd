import { z } from "zod";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { formatAge } from "@/lib/age";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Loader2, Upload, X } from "lucide-react";
import type { Goat } from "@workspace/api-client-react/src/generated/api.schemas";
import { useUpload } from "@workspace/object-storage-web";

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
  breed: z.enum(["alpine", "nubian", "saanen", "lamancha", "toggenburg", "boer", "nigerian-dwarf", "oberhasli", "mixed"]),
  lactationStatus: z.enum(["milking", "dry", "exposed", "serviced", "pregnant", "kid", "retired"]).nullable().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional().or(z.literal("")),
  herdStatus: z.enum(["dead", "first-freshener", "leased", "on-farm", "retired", "sold"]).nullable().optional(),
  leasedBuck: z.boolean().optional(),
  rightEarTattoo: z.string().max(4, "Max 4 characters").optional().transform((v) => v || undefined),
  leftEarTattoo: z.string().max(4, "Max 4 characters").optional().transform((v) => v || undefined),
});

type FormValues = z.infer<typeof formSchema>;

interface GoatFormProps {
  defaultValues?: Partial<Goat>;
  onSubmit: (data: FormValues) => void;
  isSubmitting?: boolean;
}

export function GoatForm({ defaultValues, onSubmit, isSubmitting = false }: GoatFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: (response) => {
      form.setValue("imageUrl", `/api/storage${response.objectPath}`);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
        ? ((defaultValues?.lactationStatus as "milking" | "dry" | "exposed" | "serviced" | "pregnant" | "kid" | "retired" | null | undefined) || null)
        : (defaultValues?.lactationStatus as "milking" | "dry" | "exposed" | "serviced" | "pregnant" | "kid" | "retired" | undefined) || "milking",
      description: defaultValues?.description || "",
      imageUrl: defaultValues?.imageUrl || "",
      herdStatus: (defaultValues?.herdStatus as "dead" | "first-freshener" | "leased" | "on-farm" | "retired" | "sold" | null | undefined) ?? null,
      leasedBuck: defaultValues?.leasedBuck ?? false,
      rightEarTattoo: defaultValues?.rightEarTattoo || "",
      leftEarTattoo: defaultValues?.leftEarTattoo || "",
    },
  });

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
                    <SelectItem value="alpine">Alpine</SelectItem>
                    <SelectItem value="nubian">Nubian</SelectItem>
                    <SelectItem value="saanen">Saanen</SelectItem>
                    <SelectItem value="lamancha">LaMancha</SelectItem>
                    <SelectItem value="toggenburg">Toggenburg</SelectItem>
                    <SelectItem value="boer">Boer</SelectItem>
                    <SelectItem value="nigerian-dwarf">Nigerian Dwarf</SelectItem>
                    <SelectItem value="oberhasli">Oberhasli</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
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
                    <SelectItem value="exposed">Exposed (with buck)</SelectItem>
                    <SelectItem value="serviced">Serviced (cover witnessed)</SelectItem>
                    <SelectItem value="pregnant">Pregnant</SelectItem>
                    <SelectItem value="kid">Kid</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

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
                    <SelectItem value="first-freshener">First Freshener</SelectItem>
                    <SelectItem value="leased">Leased</SelectItem>
                    <SelectItem value="on-farm">On Farm</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                    <SelectItem value="sold">Sold</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Photo (Optional)</FormLabel>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <FormControl>
                      <Input placeholder="https://... or upload a file below" {...field} className="bg-background/50 flex-1" />
                    </FormControl>
                    {field.value && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => field.onChange("")}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
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
                        <><Upload className="h-4 w-4" /> Upload Image</>
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
                    {field.value?.startsWith("/api/storage") && (
                      <img src={field.value} alt="Preview" className="h-10 w-10 rounded-md object-cover border border-border" />
                    )}
                  </div>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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
            <h3 className="font-serif text-lg font-semibold text-foreground">Tattoo</h3>
            <p className="text-sm text-muted-foreground">ADGA ear tattoo identifiers (up to 4 characters each).</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="rightEarTattoo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Right Ear</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., A1B2" maxLength={4} {...field} className="bg-background/50 uppercase" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="leftEarTattoo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Left Ear</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., C3D4" maxLength={4} {...field} className="bg-background/50 uppercase" />
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

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting} size="lg" className="w-full sm:w-auto min-w-[200px] shadow-md">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {defaultValues ? "Update Record" : "Add to Herd"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
