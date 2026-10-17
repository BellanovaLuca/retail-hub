// Alias di comodo sui tipi generati (database.types.ts è generato: non metterli lì).
import type { Tables, Views } from "./database.types";

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Views } from "./database.types";

export type Profile = Tables<"profiles">;
export type PublicProfile = Views<"public_profiles">;
export type Role = Profile["role"];
export type HomeZone = Profile["home_zone"];
export type Department = Tables<"departments">;
export type ShiftTemplate = Tables<"shift_templates">;
export type Holiday = Tables<"holidays">;
export type StoreSettings = Tables<"store_settings">;
