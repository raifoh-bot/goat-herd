import { useMemo } from "react";
import {
  useListFarms,
  useGetPlatformSettings,
  getListFarmsQueryKey,
  getGetPlatformSettingsQueryKey,
} from "@workspace/api-client-react";
import { SuperadminLayout } from "@/components/superadmin-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FarmsTable } from "./farm-table";

/**
 * Suspended farms, with their existing actions (reactivate, users, login
 * link, delete). A reactivated farm moves back to the main Farms page.
 */
export default function SuperadminSuspendedFarms() {
  const {
    data: farms,
    isLoading,
    error,
  } = useListFarms({
    query: { queryKey: getListFarmsQueryKey(), retry: false },
  });
  const { data: thresholds } = useGetPlatformSettings({
    query: { queryKey: getGetPlatformSettingsQueryKey(), retry: false },
  });

  const suspendedFarms = useMemo(
    () =>
      (farms ?? []).filter((f) => !f.deletedAt && f.status === "suspended"),
    [farms],
  );

  return (
    <SuperadminLayout>
      <Card>
        <CardHeader>
          <CardTitle>Suspended farms</CardTitle>
          <CardDescription>
            Farms whose members can't sign in until they are reactivated.
            Reactivating moves a farm back to the main Farms page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading farms…
            </p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">
              Could not load farms. You may not have access.
            </p>
          ) : suspendedFarms.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No suspended farms.
            </p>
          ) : (
            <FarmsTable farms={suspendedFarms} thresholds={thresholds} />
          )}
        </CardContent>
      </Card>
    </SuperadminLayout>
  );
}
