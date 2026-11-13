import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getRoadStatusServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://placeholder-url-for-build.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "placeholder-anon-key-for-build";
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });
}

export async function requireOfficial() {
  const client = await getRoadStatusServerClient();
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, user } : null;
}
