import { closeDatabase, getDatabase } from "../src/server/database/client";

getDatabase().sqlite.prepare("SELECT 1").get();
closeDatabase();
console.log("Harbor database is ready.");
