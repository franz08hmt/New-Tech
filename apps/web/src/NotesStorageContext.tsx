import { createContext } from "react";
// No default shared key: notes cannot be assigned to an unknown principal.
export const NotesStorageContext = createContext<string | null>(null);
