import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Settings, Zap, Home, CalendarClock, HeartPulse, Loader2, Upload, X, PawPrint } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { DEFAULT_FARM_NAME, DEFAULT_GESTATION_DAYS, DEFAULT_FAMACHA_THRESHOLD } from "@/lib/settings";
import { BREED_CATALOG, BREED_SLUGS } from "@/lib/breeds";
import { GoatIcon } from "@/components/goat-icon";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { UsersTab } from "./users-tab";
import { AccountTab } from "./account-tab";

const TAB_VALUES = ["farm", "users", "account"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function FarmTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const updateSettings = useUpdateSettings();

  const [farmName, setFarmName] = useState("");
  const [adgaNumber, setAdgaNumber] = useState("");
  const [gestationDays, setGestationDays] = useState("");
  const [enabledBreeds, setEnabledBreeds] = useState<string[]>([...BREED_SLUGS]);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Keep the editable fields in sync once the saved settings load in.
  useEffect(() => {
    if (settings) {
      setFarmName(settings.farmName ?? DEFAULT_FARM_NAME);
      setAdgaNumber(settings.adgaNumber ?? "");
      setGestationDays(String(settings.gestationDays ?? DEFAULT_GESTATION_DAYS));
      setEnabledBreeds(
        settings.enabledBreeds && settings.enabledBreeds.length > 0
          ? settings.enabledBreeds
          : [...BREED_SLUGS],
      );
    }
  }, [settings]);

  const save = (
    data: Parameters<typeof updateSettings.mutate>[0]["data"],
    { title, description }: { title: string; description: string },
  ) => {
    updateSettings.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({ title, description });
        },
        onError: () =>
          toast({
            title: "Could not save setting",
            description: "That change could not be saved.",
            variant: "destructive",
          }),
      },
    );
  };

  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      const logoUrl = `/api/storage${response.objectPath}`;
      save(
        { logoUrl },
        {
          title: "Logo uploaded",
          description: "Your farm logo now appears in the sidebar.",
        },
      );
    },
    onError: (error) => {
      const message = error.message.toLowerCase();
      const isTooLarge = message.includes("5 mb") || message.includes("exceeds");
      toast({
        title: "Upload failed",
        description: isTooLarge
          ? "That image is too large — please choose a file under 5 MB."
          : "Upload storage is unavailable right now — please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const busy = isLoading || updateSettings.isPending;

  const handleSaveFarmName = () => {
    const trimmed = farmName.trim();
    if (!trimmed) {
      toast({
        title: "Enter a farm name",
        description: "The farm name cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    save(
      { farmName: trimmed },
      { title: "Farm name saved", description: `Your herd is now shown as "${trimmed}".` },
    );
  };

  const handleSaveAdga = () => {
    const trimmed = adgaNumber.trim();
    save(
      { adgaNumber: trimmed === "" ? null : trimmed },
      {
        title: "ADGA number saved",
        description: trimmed
          ? `Your ADGA membership number is now ${trimmed}.`
          : "Your ADGA membership number was cleared.",
      },
    );
  };

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const handleRemoveLogo = () => {
    save(
      { logoUrl: null },
      { title: "Logo removed", description: "The default herd icon is shown again." },
    );
  };

  const handleSaveGestation = () => {
    const days = Number(gestationDays);
    if (!Number.isInteger(days) || days < 100 || days > 250) {
      toast({
        title: "Check the gestation length",
        description: "Enter a whole number of days between 100 and 250.",
        variant: "destructive",
      });
      return;
    }
    save(
      { gestationDays: days },
      {
        title: "Gestation length saved",
        description: `Expected kidding dates now use ${days} days.`,
      },
    );
  };

  const handleToggleAi = (usesAi: boolean) => {
    save(
      { usesAi },
      {
        title: usesAi ? "AI breeding enabled" : "AI breeding disabled",
        description: usesAi
          ? "Artificial insemination tools are now visible across the app."
          : "AI tools are now hidden. Breedings default to natural service.",
      },
    );
  };

  const toggleBreed = (slug: string, checked: boolean) => {
    setEnabledBreeds((prev) =>
      checked ? [...prev, slug] : prev.filter((b) => b !== slug),
    );
  };

  const savedBreeds = settings?.enabledBreeds ?? [...BREED_SLUGS];
  const breedsDirty =
    enabledBreeds.length !== savedBreeds.length ||
    [...enabledBreeds].sort().join(",") !== [...savedBreeds].sort().join(",");

  const handleSaveBreeds = () => {
    if (enabledBreeds.length === 0) {
      toast({
        title: "Select at least one breed",
        description: "Your farm needs at least one breed enabled.",
        variant: "destructive",
      });
      return;
    }
    save(
      { enabledBreeds: enabledBreeds as Parameters<typeof updateSettings.mutate>[0]["data"]["enabledBreeds"] },
      {
        title: "Breeds saved",
        description: `${enabledBreeds.length} breed${enabledBreeds.length !== 1 ? "s" : ""} are now selectable on your farm.`,
      },
    );
  };

  return (
    <div className="space-y-8">
      <Card className="border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" /> Farm Identity
          </CardTitle>
          <CardDescription>The name, registration, and logo shown across the app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border p-4">
            <Label htmlFor="farm-name" className="text-base font-medium">
              Farm / herd name
            </Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                id="farm-name"
                value={farmName}
                disabled={busy}
                maxLength={100}
                placeholder={DEFAULT_FARM_NAME}
                onChange={(e) => setFarmName(e.target.value)}
                className="bg-background/50 sm:max-w-sm"
              />
              <Button
                onClick={handleSaveFarmName}
                disabled={busy || farmName.trim() === (settings?.farmName ?? "")}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-4">
            <Label htmlFor="adga-number" className="text-base font-medium">
              ADGA #
            </Label>
            <p className="text-sm text-muted-foreground">
              Your American Dairy Goat Association membership number.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                id="adga-number"
                value={adgaNumber}
                disabled={busy}
                maxLength={50}
                placeholder="e.g. AD1234567"
                onChange={(e) => setAdgaNumber(e.target.value)}
                className="bg-background/50 sm:max-w-sm"
              />
              <Button
                onClick={handleSaveAdga}
                disabled={busy || adgaNumber.trim() === (settings?.adgaNumber ?? "")}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="space-y-1">
              <Label className="text-base font-medium">Farm logo</Label>
              <p className="text-sm text-muted-foreground">
                Shown in the sidebar in place of the default icon, and available for printed reports.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {settings?.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt="Farm logo"
                  className="h-16 w-16 rounded-xl object-cover border border-border bg-white"
                />
              ) : (
                <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-border">
                  <GoatIcon className="h-8 w-8" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoSelect}
                />
                <Button
                  variant="outline"
                  disabled={busy || isUploading}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" /> {settings?.logoUrl ? "Replace logo" : "Upload logo"}
                    </>
                  )}
                </Button>
                {settings?.logoUrl && (
                  <Button
                    variant="ghost"
                    disabled={busy || isUploading}
                    onClick={handleRemoveLogo}
                  >
                    <X className="mr-2 h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" /> Breeding
          </CardTitle>
          <CardDescription>
            Defaults that drive the breeding workflow for the whole farm.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border p-4">
            <Label htmlFor="gestation-days" className="text-base font-medium">
              Default gestation length (days)
            </Label>
            <p className="text-sm text-muted-foreground">
              Used to auto-calculate the expected kidding date when recording a breeding.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                id="gestation-days"
                type="number"
                min={100}
                max={250}
                step={1}
                value={gestationDays}
                disabled={busy}
                onChange={(e) => setGestationDays(e.target.value)}
                className="bg-background/50 sm:max-w-[160px]"
              />
              <Button
                onClick={handleSaveGestation}
                disabled={busy || gestationDays === String(settings?.gestationDays ?? "")}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="flex items-start justify-between gap-6 rounded-lg border border-border p-4">
            <div className="space-y-1">
              <Label htmlFor="uses-ai" className="text-base font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> This farm uses artificial insemination
              </Label>
              <p className="text-sm text-muted-foreground">
                When off, the AI Inventory, the Natural/AI breeding toggle, and AI-specific
                fields and badges are hidden. Existing AI records are kept and still work.
              </p>
            </div>
            <Switch
              id="uses-ai"
              checked={settings?.usesAi ?? true}
              disabled={busy}
              onCheckedChange={handleToggleAi}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" /> Herd Health
          </CardTitle>
          <CardDescription>
            Defaults for health tracking and herd work days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 rounded-lg border border-border p-4">
            <Label htmlFor="famacha-threshold" className="text-base font-medium">
              FAMACHA deworming threshold
            </Label>
            <p className="text-sm text-muted-foreground">
              When a goat scores at or above this FAMACHA level (1 = healthy, 5 = severely
              anemic), the app suggests logging a deworming.
            </p>
            <Select
              value={String(settings?.famachaThreshold ?? DEFAULT_FAMACHA_THRESHOLD)}
              disabled={busy}
              onValueChange={(value) =>
                save(
                  { famachaThreshold: Number(value) },
                  {
                    title: "FAMACHA threshold saved",
                    description: `Deworming will be suggested at a score of ${value} or higher.`,
                  },
                )
              }
            >
              <SelectTrigger id="famacha-threshold" className="bg-background/50 sm:max-w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((score) => (
                  <SelectItem key={score} value={String(score)}>
                    {score}+
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <PawPrint className="h-4 w-4 text-primary" /> Breeds on this farm
          </CardTitle>
          <CardDescription>
            Choose which breeds exist on your farm. Only these appear when adding goats,
            recording breedings, or importing. Enable a new breed here before adding a goat of it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {enabledBreeds.length} of {BREED_CATALOG.length} breeds selected
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setEnabledBreeds([...BREED_SLUGS])}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setEnabledBreeds([])}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {BREED_CATALOG.map((breed) => (
                <label
                  key={breed.slug}
                  className="flex items-center gap-2.5 text-sm font-medium text-foreground cursor-pointer"
                >
                  <Checkbox
                    checked={enabledBreeds.includes(breed.slug)}
                    disabled={busy}
                    onCheckedChange={(checked) => toggleBreed(breed.slug, checked === true)}
                  />
                  {breed.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveBreeds} disabled={busy || !breedsDirty}>
              Save breeds
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminSettings() {
  const { user: currentUser } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const isManager = currentUser.role === "admin" || currentUser.role === "owner";

  const requestedTab = new URLSearchParams(search).get("tab");
  const initialTab: TabValue =
    requestedTab && (TAB_VALUES as readonly string[]).includes(requestedTab)
      ? (requestedTab as TabValue)
      : isManager
        ? "farm"
        : "account";

  const [tab, setTab] = useState<TabValue>(initialTab);

  // A Farm Hand may only see the Account tab.
  const effectiveTab: TabValue = !isManager ? "account" : tab;

  const handleTabChange = (value: string) => {
    const next = value as TabValue;
    setTab(next);
    setLocation(`/admin/settings?tab=${next}`, { replace: true });
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-3xl font-serif font-bold text-foreground">Farm Settings</h2>
            <p className="text-muted-foreground">Configure how MyGoatHerd works for your farm.</p>
          </div>
        </div>

        <Tabs value={effectiveTab} onValueChange={handleTabChange}>
          <TabsList>
            {isManager && <TabsTrigger value="farm">Farm</TabsTrigger>}
            {isManager && <TabsTrigger value="users">Users</TabsTrigger>}
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>

          {isManager && (
            <TabsContent value="farm" className="mt-6">
              <FarmTab />
            </TabsContent>
          )}
          {isManager && (
            <TabsContent value="users" className="mt-6">
              <UsersTab />
            </TabsContent>
          )}
          <TabsContent value="account" className="mt-6">
            <AccountTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
