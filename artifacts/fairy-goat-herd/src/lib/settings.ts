import {
  useGetSettings,
  getGetSettingsQueryKey,
  type HealthScheduleIntervals,
} from "@workspace/api-client-react";
import { BREED_SLUGS } from "@/lib/breeds";

export type WeightUnit = "kg" | "lb";

export const DEFAULT_FARM_NAME = "MyGoatHerd";
export const DEFAULT_WEIGHT_UNIT: WeightUnit = "lb";
export const DEFAULT_GESTATION_DAYS = 150;
export const DEFAULT_FAMACHA_THRESHOLD = 3;

/** The short label shown next to a weight value (e.g. "4.2 lbs", "1.9 kg"). */
export function weightUnitLabel(unit: WeightUnit): string {
  return unit === "kg" ? "kg" : "lbs";
}

export interface FarmSettingsValues {
  usesAi: boolean;
  farmName: string;
  adgaNumber: string | null;
  logoUrl: string | null;
  weightUnit: WeightUnit;
  gestationDays: number;
  enabledBreeds: string[];
  famachaThreshold: number;
  healthScheduleIntervals: HealthScheduleIntervals;
  isLoading: boolean;
}

/**
 * Reads the farm-level settings. Each value falls back to its server-side
 * default while the request is loading (or if it fails), so the UI stays stable
 * and only reflects an explicit opt-out once we positively know the farm's
 * preference.
 */
export function useFarmSettings(): FarmSettingsValues {
  const { data, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey(), staleTime: 30_000 },
  });
  return {
    usesAi: data?.usesAi ?? true,
    farmName: data?.farmName?.trim() ? data.farmName : DEFAULT_FARM_NAME,
    adgaNumber: data?.adgaNumber ?? null,
    logoUrl: data?.logoUrl ?? null,
    weightUnit: (data?.weightUnit as WeightUnit) ?? DEFAULT_WEIGHT_UNIT,
    gestationDays: data?.gestationDays ?? DEFAULT_GESTATION_DAYS,
    enabledBreeds:
      data?.enabledBreeds && data.enabledBreeds.length > 0
        ? data.enabledBreeds
        : [...BREED_SLUGS],
    famachaThreshold: data?.famachaThreshold ?? DEFAULT_FAMACHA_THRESHOLD,
    healthScheduleIntervals: data?.healthScheduleIntervals ?? {},
    isLoading,
  };
}
