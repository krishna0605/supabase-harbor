import { checkDatabaseReadiness } from "../src/server/database/client";

async function main() {
  await checkDatabaseReadiness();
  console.log("Harbor database is ready.");
}

void main();
