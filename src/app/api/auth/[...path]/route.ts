import { auth } from "@/server/auth/neon-auth";

export const dynamic = "force-dynamic";

export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
