import { useEffect, type ComponentType } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthGuard, useAuth } from "@/lib/auth";
import { basePath, getUrlFarmSlug, farmUrl } from "@/lib/farm";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Register from "@/pages/register";
import SuperadminFarms from "@/pages/superadmin/farms";
import SuperadminUsers from "@/pages/superadmin/users";
import SuperadminForgotPassword from "@/pages/superadmin/forgot-password";
import SuperadminResetPassword from "@/pages/superadmin/reset-password";
import { SuperadminViewBanner } from "@/components/superadmin-view-banner";
import { MissingEmailBanner } from "@/components/missing-email-banner";
import Dashboard from "@/pages/dashboard";
import GoatsList from "@/pages/goats/index";
import GoatNew from "@/pages/goats/new";
import GoatImport from "@/pages/goats/import";
import GoatDetails from "@/pages/goats/[id]";
import BreedingsList from "@/pages/breedings/index";
import BreedingNew from "@/pages/breedings/new";
import BreedingImport from "@/pages/breedings/import";
import BreedingDetail from "@/pages/breedings/[id]";
import HerdWorkDay from "@/pages/health-events/new";
import WorksheetResults from "@/pages/health-events/worksheet";
import InventoryList from "@/pages/inventory/index";
import Reports from "@/pages/reports/index";
import LineageReports from "@/pages/reports/lineage";
import BarnWorksheet from "@/pages/reports/barn-worksheet";
import PedigreeCertificate from "@/pages/reports/pedigree";
import HealthHistoryReport from "@/pages/reports/health-history";
import ShowTime from "@/pages/reports/show-time";
import ShowResultsPage from "@/pages/reports/show-results";
import AdminSettings from "@/pages/admin/settings";

const queryClient = new QueryClient();

function SuperadminRoute({
  component: Component,
}: {
  component: ComponentType;
}) {
  const { user } = useAuth();
  if (user.role !== "superadmin") {
    return <Redirect to="/" replace />;
  }
  return <Component />;
}

/**
 * Root landing in the global (no-farm) context. Sends the authenticated user to
 * their real home: superadmins to the platform panel, farm members to their
 * farm's path-prefixed app (a full-page redirect so the router re-mounts under
 * `/<slug>`). Unauthenticated visitors are bounced to login by the AuthGuard.
 */
function RootRedirect() {
  const { user } = useAuth();
  const farmSlug = user.role !== "superadmin" ? user.farmSlug : null;

  useEffect(() => {
    if (farmSlug) {
      window.location.replace(farmUrl(farmSlug, "/"));
    }
  }, [farmSlug]);

  if (user.role === "superadmin") {
    return <Redirect to="/superadmin/farms" replace />;
  }
  return null;
}

export function RootLanding() {
  return (
    <AuthGuard>
      <RootRedirect />
    </AuthGuard>
  );
}

/** Authenticated farm pages, mounted under the active farm's `/<slug>` base. */
function AuthenticatedRoutes() {
  return (
    <AuthGuard>
      <SuperadminViewBanner />
      <MissingEmailBanner />
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/goats" component={GoatsList} />
        <Route path="/goats/new" component={GoatNew} />
        <Route path="/goats/import" component={GoatImport} />
        <Route path="/goats/:id" component={GoatDetails} />
        <Route path="/breedings" component={BreedingsList} />
        <Route path="/breedings/new" component={BreedingNew} />
        <Route path="/breedings/import" component={BreedingImport} />
        <Route path="/breedings/:id" component={BreedingDetail} />
        <Route path="/health-events/new" component={HerdWorkDay} />
        <Route path="/health-events/worksheet" component={WorksheetResults} />
        <Route path="/inventory" component={InventoryList} />
        <Route path="/reports" component={Reports} />
        <Route path="/reports/lineage" component={LineageReports} />
        <Route path="/reports/barn-worksheet" component={BarnWorksheet} />
        <Route path="/reports/pedigree" component={PedigreeCertificate} />
        <Route path="/reports/health-history" component={HealthHistoryReport} />
        <Route path="/reports/show-time" component={ShowTime} />
        <Route path="/reports/show-results" component={ShowResultsPage} />
        <Route path="/lineage">
          <Redirect to="/reports/lineage" replace />
        </Route>
        <Route path="/admin/users">
          <Redirect to="/admin/settings?tab=users" replace />
        </Route>
        <Route path="/admin/settings" component={AdminSettings} />
        <Route component={NotFound} />
      </Switch>
    </AuthGuard>
  );
}

/** Routes served under a farm's `/<slug>` prefix. */
function FarmRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route component={AuthenticatedRoutes} />
    </Switch>
  );
}

/** Routes served at the domain root (no farm): login fallback, register, superadmin. */
function GlobalRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/superadmin/forgot-password" component={SuperadminForgotPassword} />
      <Route path="/superadmin/reset-password" component={SuperadminResetPassword} />
      <Route path="/superadmin/farms">
        <AuthGuard>
          <SuperadminRoute component={SuperadminFarms} />
        </AuthGuard>
      </Route>
      <Route path="/superadmin/users">
        <AuthGuard>
          <SuperadminRoute component={SuperadminUsers} />
        </AuthGuard>
      </Route>
      <Route path="/" component={RootLanding} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const base = basePath();
  const farmSlug = getUrlFarmSlug();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {farmSlug ? (
          <WouterRouter base={`${base}/${farmSlug}`}>
            <FarmRouter />
          </WouterRouter>
        ) : (
          <WouterRouter base={base}>
            <GlobalRouter />
          </WouterRouter>
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
