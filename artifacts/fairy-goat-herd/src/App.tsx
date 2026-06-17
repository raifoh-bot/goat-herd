import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthGuard } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import GoatsList from "@/pages/goats/index";
import GoatNew from "@/pages/goats/new";
import GoatImport from "@/pages/goats/import";
import GoatDetails from "@/pages/goats/[id]";
import BreedingsList from "@/pages/breedings/index";
import BreedingNew from "@/pages/breedings/new";
import BreedingDetail from "@/pages/breedings/[id]";
import InventoryList from "@/pages/inventory/index";
import LineageReports from "@/pages/lineage";
import AdminUsers from "@/pages/admin/users";
import AdminSettings from "@/pages/admin/settings";

const queryClient = new QueryClient();

function AuthenticatedRoutes() {
  return (
    <AuthGuard>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/goats" component={GoatsList} />
        <Route path="/goats/new" component={GoatNew} />
        <Route path="/goats/import" component={GoatImport} />
        <Route path="/goats/:id" component={GoatDetails} />
        <Route path="/breedings" component={BreedingsList} />
        <Route path="/breedings/new" component={BreedingNew} />
        <Route path="/breedings/:id" component={BreedingDetail} />
        <Route path="/inventory" component={InventoryList} />
        <Route path="/lineage" component={LineageReports} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/settings" component={AdminSettings} />
        <Route component={NotFound} />
      </Switch>
    </AuthGuard>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route component={AuthenticatedRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
