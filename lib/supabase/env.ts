function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variabile d'ambiente mancante: ${name} (vedi .env.example)`);
  return value;
}

// Le variabili NEXT_PUBLIC_* vanno lette per nome esteso, perché Next le sostituisce in fase di build.
export const supabaseUrl = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Sessione lunga sul telefono personale (§4). */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
