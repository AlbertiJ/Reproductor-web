/* ============================================================
 * ROCIO — App.tsx
 * Punto de entrada principal: configuración de router y providers.
 * ============================================================ */

import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Player from "@/pages/Player";

/* Cliente de React Query — sin backend en esta versión web */
const queryClient = new QueryClient();

/* Router principal: el Player es la ruta raíz */
function Router() {
  return (
    <Switch>
      <Route path="/" component={Player} />
      <Route component={NotFound} />
    </Switch>
  );
}

/* App principal — envuelve todo con los providers necesarios */
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
