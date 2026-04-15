import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Loader2 } from "lucide-react";
import type { Goat } from "@workspace/api-client-react/src/generated/api.schemas";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be less than 50 characters"),
  breed: z.enum(["alpine", "nubian", "saanen", "lamancha", "toggenburg", "boer", "nigerian-dwarf", "oberhasli", "mixed"]),
  status: z.enum(["healthy", "watch", "treatment", "dry"]),
  milkPerDay: z.number().min(0).max(10),
  lactationStatus: z.enum(["milking", "dry", "pregnant", "kid"]),
  age: z.coerce.number().min(0, "Age must be positive").max(25, "Age should be realistic for a dairy goat"),
  description: z.string().optional(),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

interface GoatFormProps {
  defaultValues?: Partial<Goat>;
  onSubmit: (data: FormValues) => void;
  isSubmitting?: boolean;
}

export function GoatForm({ defaultValues, onSubmit, isSubmitting = false }: GoatFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: defaultValues?.name || "",
      breed: defaultValues?.breed || "mixed",
      status: defaultValues?.status || "healthy",
      milkPerDay: defaultValues?.milkPerDay ?? 2.5,
      lactationStatus: defaultValues?.lactationStatus || "milking",
      age: defaultValues?.age || 2,
      description: defaultValues?.description || "",
      imageUrl: defaultValues?.imageUrl || "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="E.g., Clover, Hazel, Juniper" {...field} className="bg-background/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="age"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Age (Years)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" {...field} className="bg-background/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Health Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="watch">Watch</SelectItem>
                    <SelectItem value="treatment">Treatment</SelectItem>
                    <SelectItem value="dry">Dry</SelectItem>
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
                <FormLabel>Photo Link (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="https://..." {...field} className="bg-background/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="milkPerDay"
          render={({ field }) => (
            <FormItem className="bg-card/50 p-4 rounded-xl border border-border">
              <FormLabel className="flex justify-between">
                <span>Milk Production</span>
                <span className="text-primary font-bold">{field.value} qt/day</span>
              </FormLabel>
              <FormControl>
                <div className="pt-4 pb-2">
                  <Slider
                    min={0}
                    max={10}
                    step={0.1}
                    value={[field.value]}
                    onValueChange={(vals) => field.onChange(vals[0])}
                    className="[&_[role=slider]]:h-5 [&_[role=slider]]:w-5"
                  />
                </div>
              </FormControl>
              <FormDescription>Daily milk production in quarts.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

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
