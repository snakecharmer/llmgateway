import { handle } from "hono/aws-lambda";
import { app } from "./index";

export { app };
export const handler = handle(app);
/** Exported type definition for the hono/client. */
export type AppRouter = typeof app;