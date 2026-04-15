import { z } from "zod";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { formatAge } from "@/lib/age";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, X } from "lucide-react";
import type { Goat } from "@workspace/api-client-react/src/generated/api.schemas";
import { useUpload } from "@workspace/object-storage-web";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be less than 50 characters"),
  registeredName: z.string().optional(),
  adgaId: z.string().optional(),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  sex: z.enum(["doe", "buck"]).optional(),
  damName: z.string().optional(),
  sireName: z.string().optional(),
  maternalGranddamName: z.string().optional(),
  maternalGrandsireName: z.string().optional(),
  paternalGranddamName: z.string().optional(),
  paternalGrandsireName: z.string().optional(),
  breed: z.enum(["alpine", "nubian", "saanen", "lamancha", "toggenburg", "boer", "nigerian-dwarf", "oberhasli", "mixed"]),
  lactationStatus: z.enum(["milking", "dry", "pregnant", "kid", "retired"]),
  description: z.string().optional(),
  imageUrl: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

interface GoatFormProps {
  defaultValues?: Partial<Goat>;
  onSubmit: (data: FormValues) => void;
  isSubmitting?: boolean;
}

export function GoatForm({ defaultValues, onSubmit, isSubmitting = false }: GoatFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      sex: (defaultValues?.sex as "doe" | "buck" | undefined) || undefined,
      damName: defaultValues?.damName || "",
      sireName: defaultValues?.sireName || "",
      maternalGranddamName: defaultValues?.maternalGranddamName || "",
      maternalGrandsireName: defaultValues?.maternalGrandsireName || "",
      paternalGranddamName: defaultValues?.paternalGranddamName || "",
      paternalGrandsireName: defaultValues?.paternalGrandsireName || "",
      breed: defaultValues?.breed || "mixed",
      lactationStatus: (defaultValues?.lactationStatus as "milking" | "dry" | "pregnant" | "kid" | "retired" | undefined) || "milking",
      description: defaultValues?.description || "",
      imageUrl: defaultValues?.imageUrl || "",
    },
  });

  const dateOfBirth = form.watch("dateOfBirth");
  const damName = form.watch("damName");
  const sireName = form.watch("sireName");

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
                    </SelectContent>
                  </Select>
                  <FormDescription>Whether this goat is a doe or a buck.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
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
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue placeholder="Select lactation status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="milking">Milking</SelectItem>
                    <SelectItem value="dry">Dry</SelectItem>
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
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
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
            <FormField
              control={form.control}
              name="damName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dam</FormLabel>
                  <FormControl>
                    <Input placeholder="Mother's name" {...field} className="bg-background/50" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sireName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sire</FormLabel>
                  <FormControl>
                    <Input placeholder="Father's name" {...field} className="bg-background/50" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maternalGranddamName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maternal Granddam</FormLabel>
                  <FormControl>
                    <Input placeholder="Dam's dam" {...field} className="bg-background/50" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maternalGrandsireName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maternal Grandsire</FormLabel>
                  <FormControl>
                    <Input placeholder="Dam's sire" {...field} className="bg-background/50" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paternalGranddamName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paternal Granddam</FormLabel>
                  <FormControl>
                    <Input placeholder="Sire's dam" {...field} className="bg-background/50" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paternalGrandsireName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paternal Grandsire</FormLabel>
                  <FormControl>
                    <Input placeholder="Sire's sire" {...field} className="bg-background/50" />
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
