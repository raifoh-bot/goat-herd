import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import GoatsList from "@/pages/goats/index";
import GoatNew from "@/pages/goats/new";
import GoatImport from "@/pages/goats/import";
import GoatDetails from "@/pages/goats/[id]";
import BreedingsList from "@/pages/breedings/index";
import BreedingNew from "@/pages/breedings/new";
import BreedingDetail from "@/pages/breedings/[id]";
import LineageReports from "@/pages/lineage";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/goats" component={GoatsList} />
      <Route path="/goats/new" component={GoatNew} />
      <Route path="/goats/import" component={GoatImport} />
      <Route path="/goats/:id" component={GoatDetails} />
      <Route path="/breedings" component={BreedingsList} />
      <Route path="/breedings/new" component={BreedingNew} />
      <Route path="/breedings/:id" component={BreedingDetail} />
      <Route path="/lineage" component={LineageReports} />
      <Route component={NotFound} />
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
