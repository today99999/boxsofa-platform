export type SupabaseCookieToSet<TOptions = unknown> = {
  name: string;
  value: string;
  options?: TOptions;
};

export function writeSupabaseCookies<TOptions>(
  cookieStore: { set(name: string, value: string, options?: TOptions): unknown },
  cookiesToSet: SupabaseCookieToSet<TOptions>[]
) {
  try {
    cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
  } catch {
    // Server Components can read cookies but Next.js only permits writes in actions and route handlers.
  }
}
