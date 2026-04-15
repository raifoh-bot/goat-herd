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
  element: z.enum(["fire", "water", "earth", "air", "light", "shadow"]),
  status: z.enum(["healthy", "sick", "resting", "enchanted"]),
  magicLevel: z.number().min(1).max(100),
  wingType: z.enum(["butterfly", "dragonfly", "moth", "feathered", "crystal", "none"]),
  age: z.coerce.number().min(0, "Age must be positive").max(1000, "Goats don't live that long"),
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
      element: defaultValues?.element || "earth",
      status: defaultValues?.status || "healthy",
      magicLevel: defaultValues?.magicLevel || 10,
      wingType: defaultValues?.wingType || "none",
      age: defaultValues?.age || 1,
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
                <FormLabel>True Name</FormLabel>
                <FormControl>
                  <Input placeholder="E.g., Bramble, Lumina, Cinder" {...field} className="bg-background/50" />
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
                <FormLabel>Age (Moons)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} className="bg-background/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="element"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Elemental Alignment</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue placeholder="Select element" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="earth">Earth</SelectItem>
                    <SelectItem value="water">Water</SelectItem>
                    <SelectItem value="air">Air</SelectItem>
                    <SelectItem value="fire">Fire</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="shadow">Shadow</SelectItem>
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
                <FormLabel>Current Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="resting">Resting</SelectItem>
                    <SelectItem value="enchanted">Enchanted</SelectItem>
                    <SelectItem value="sick">Sick</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="wingType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Wing Morphology</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue placeholder="Select wings" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">None (Wingless)</SelectItem>
                    <SelectItem value="butterfly">Butterfly</SelectItem>
                    <SelectItem value="dragonfly">Dragonfly</SelectItem>
                    <SelectItem value="moth">Moth</SelectItem>
                    <SelectItem value="feathered">Feathered</SelectItem>
                    <SelectItem value="crystal">Crystal</SelectItem>
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
                <FormLabel>Portrait Link (Optional)</FormLabel>
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
          name="magicLevel"
          render={({ field }) => (
            <FormItem className="bg-card/50 p-4 rounded-xl border border-border">
              <FormLabel className="flex justify-between">
                <span>Innate Magic Resonance</span>
                <span className="text-primary font-bold">{field.value} / 100</span>
              </FormLabel>
              <FormControl>
                <div className="pt-4 pb-2">
                  <Slider
                    min={1}
                    max={100}
                    step={1}
                    value={[field.value]}
                    onValueChange={(vals) => field.onChange(vals[0])}
                    className="[&_[role=slider]]:h-5 [&_[role=slider]]:w-5"
                  />
                </div>
              </FormControl>
              <FormDescription>
                Higher magic levels require specialized care routines.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Keeper's Notes</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Temperament, favorite snacks, notable magical outbursts..." 
                  className="resize-none min-h-[120px] bg-background/50" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting} size="lg" className="w-full sm:w-auto min-w-[200px] shadow-md">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {defaultValues ? "Update Records" : "Welcome to the Herd"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
