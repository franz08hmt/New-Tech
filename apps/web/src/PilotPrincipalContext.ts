import { createContext } from "react";
import type { PilotPrincipal } from "@examate/contracts";

// Only PilotAccess supplies the principal returned by verified session state.
// UI capability hints never replace backend permission checks.
export const PilotPrincipalContext = createContext<PilotPrincipal | undefined>(
  undefined,
);
