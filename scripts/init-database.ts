import { checkDatabaseReadiness } from "../src/server/database/client";

await checkDatabaseReadiness();
console.log("Harbor database is ready.");
