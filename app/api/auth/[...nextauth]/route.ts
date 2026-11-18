// Auth.js (NextAuth v5) catch-all route handler. Exposes the OAuth endpoints
// (sign in, callback, sign out, session, ...) under `/api/auth/*`. The actual
// configuration lives in `@/auth`.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
