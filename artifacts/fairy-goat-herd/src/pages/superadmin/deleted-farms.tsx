import { useMemo } from "react";
import {
  useListFarms,
  getListFarmsQueryKey,
} from "@workspace/api-client-react";
import { SuperadminLayout } from "@/components/superadmin-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "./farm-table";

/**
 * Deleted farms audit record: when each farm was removed, by whom, and why.
 * Deleted farms cannot be reactivated; their users can no longer sign in.
 */
export default function SuperadminDeletedFarms() {
  const {
    data: farms,
    isLoading,
    error,
  } = useListFarms({
    query: { queryKey: getListFarmsQueryKey(), retry: false },
  });

  const deletedFarms = useMemo(
    () =>
      (farms ?? [])
        .filter((f) => f.deletedAt)
        .sort(
          (a, b) =>
            new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime(),
        ),
    [farms],
  );

  return (
    <SuperadminLayout>
      <Card>
        <CardHeader>
          <CardTitle>Deleted farms</CardTitle>
          <CardDescription>
            Removed farms are kept here for auditing. Their users can no longer
            sign in.
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
          ) : deletedFarms.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No deleted farms.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Farm</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deletedFarms.map((farm) => (
                  <TableRow key={farm.id}>
                    <TableCell>
                      <div className="font-medium">{farm.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {farm.slug}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(farm.deletedAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {farm.deletedByUsername ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-xs text-sm text-muted-foreground">
                      {farm.deletedReason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </SuperadminLayout>
  );
}
