// Genera lib/supabase/database.types.ts dallo schema `public` di un database Postgres,
// nello stesso formato di `supabase gen types typescript`.
// Uso: DATABASE_URL=postgres://… pnpm db:types:local
// (con un progetto Supabase collegato si può usare anche `pnpm db:types`).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Imposta DATABASE_URL (database con le migrazioni applicate).");
  process.exit(1);
}

const query = `
with cols as (
  select c.table_name, c.column_name, c.ordinal_position, c.is_nullable = 'YES' as nullable,
         c.column_default is not null or c.is_identity = 'YES' as has_default,
         c.data_type, c.udt_name, t.table_type
  from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public'
),
checks as (
  -- vincoli CHECK del tipo "col in ('a','b')" → union di letterali
  select rel.relname as table_name, att.attname as column_name,
         array_agg(distinct m[1]) as literals
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace and n.nspname = 'public'
  join lateral unnest(con.conkey) k(attnum) on true
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = k.attnum
  cross join lateral regexp_matches(pg_get_constraintdef(con.oid), '''([^'']*)''::text', 'g') m
  where con.contype = 'c' and cardinality(con.conkey) = 1
    and pg_get_constraintdef(con.oid) ~ '= ANY \\(\\(?ARRAY\\['
  group by 1, 2
),
fks as (
  select con.conname, rel.relname as table_name, frel.relname as ref_table,
         array(select a.attname from unnest(con.conkey) with ordinality k(n, o)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.o) as cols,
         array(select a.attname from unnest(con.confkey) with ordinality k(n, o)
               join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.o) as ref_cols
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_class frel on frel.oid = con.confrelid
  join pg_namespace n on n.oid = rel.relnamespace and n.nspname = 'public'
  join pg_namespace fn on fn.oid = frel.relnamespace and fn.nspname = 'public'
  where con.contype = 'f'
),
uniques as (
  select rel.relname as table_name,
         array(select a.attname from unnest(con.conkey) k(n)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by a.attname) as cols
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace and n.nspname = 'public'
  where con.contype in ('u', 'p')
),
funcs as (
  select p.proname as name,
         coalesce(p.proargnames, '{}') as arg_names,
         array(select format_type(t, null) from unnest(p.proargtypes) t) as arg_types,
         format_type(p.prorettype, null) as return_type
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.prokind = 'f'
    and format_type(p.prorettype, null) <> 'trigger'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
)
select json_build_object(
  'columns', (select json_agg(cols order by table_name, ordinal_position) from cols),
  'checks', (select coalesce(json_agg(checks), '[]') from checks),
  'fks', (select coalesce(json_agg(fks), '[]') from fks),
  'uniques', (select coalesce(json_agg(uniques), '[]') from uniques),
  'funcs', (select coalesce(json_agg(funcs order by name), '[]') from funcs)
);`;

type Col = {
  table_name: string;
  column_name: string;
  nullable: boolean;
  has_default: boolean;
  data_type: string;
  udt_name: string;
  table_type: string;
};
type Fk = {
  conname: string;
  table_name: string;
  ref_table: string;
  cols: string[];
  ref_cols: string[];
};
type Func = { name: string; arg_names: string[]; arg_types: string[]; return_type: string };

const raw = execFileSync("psql", [url, "-At", "-c", query], { encoding: "utf8", maxBuffer: 64e6 });
const meta = JSON.parse(raw) as {
  columns: Col[];
  checks: { table_name: string; column_name: string; literals: string[] }[];
  fks: Fk[];
  uniques: { table_name: string; cols: string[] }[];
  funcs: Func[];
};

const checkMap = new Map(
  meta.checks.map((c) => [`${c.table_name}.${c.column_name}`, c.literals.sort()]),
);

function scalar(udt: string): string {
  switch (udt) {
    case "int2":
    case "int4":
    case "int8":
    case "float4":
    case "float8":
    case "numeric":
      return "number";
    case "bool":
      return "boolean";
    case "json":
    case "jsonb":
      return "Json";
    default:
      return "string"; // uuid, text, date, time, timestamptz…
  }
}

function pgType(name: string): string {
  const arr = name.endsWith("[]");
  const base = arr ? name.slice(0, -2) : name;
  const map: Record<string, string> = {
    integer: "int4",
    smallint: "int2",
    bigint: "int8",
    numeric: "numeric",
    boolean: "bool",
    jsonb: "jsonb",
    json: "json",
  };
  const t = scalar(map[base] ?? base);
  return arr ? `${t}[]` : t;
}

function colType(c: Col): string {
  const lits = checkMap.get(`${c.table_name}.${c.column_name}`);
  let t: string;
  if (lits) t = lits.map((l) => JSON.stringify(l)).join(" | ");
  else if (c.data_type === "ARRAY") t = `${scalar(c.udt_name.replace(/^_/, ""))}[]`;
  else t = scalar(c.udt_name);
  if (lits && c.data_type === "ARRAY") t = `(${t})[]`;
  return c.nullable ? `${t} | null` : t;
}

const byTable = new Map<string, Col[]>();
for (const c of meta.columns) {
  if (!byTable.has(c.table_name)) byTable.set(c.table_name, []);
  byTable.get(c.table_name)!.push(c);
}

const uniqueSets = new Map<string, Set<string>>();
for (const u of meta.uniques) {
  if (!uniqueSets.has(u.table_name)) uniqueSets.set(u.table_name, new Set());
  uniqueSets.get(u.table_name)!.add(u.cols.join(","));
}

function relationships(table: string): string {
  const rels = meta.fks
    .filter((f) => f.table_name === table)
    .sort((a, b) => a.conname.localeCompare(b.conname));
  if (rels.length === 0) return "[]";
  return `[\n${rels
    .map((f) => {
      const oneToOne = uniqueSets.get(table)?.has([...f.cols].sort().join(",")) ?? false;
      return `          {
            foreignKeyName: ${JSON.stringify(f.conname)};
            columns: ${JSON.stringify(f.cols)};
            isOneToOne: ${oneToOne};
            referencedRelation: ${JSON.stringify(f.ref_table)};
            referencedColumns: ${JSON.stringify(f.ref_cols)};
          }`;
    })
    .join(",\n")}\n        ]`;
}

const indent = (n: number) => " ".repeat(n);

function tableBlock(name: string, cols: Col[]): string {
  const row = cols.map((c) => `${indent(10)}${c.column_name}: ${colType(c)};`).join("\n");
  const insert = cols
    .map((c) => {
      const optional = c.nullable || c.has_default ? "?" : "";
      return `${indent(10)}${c.column_name}${optional}: ${colType(c)};`;
    })
    .join("\n");
  const update = cols.map((c) => `${indent(10)}${c.column_name}?: ${colType(c)};`).join("\n");
  return `      ${name}: {
        Row: {
${row}
        };
        Insert: {
${insert}
        };
        Update: {
${update}
        };
        Relationships: ${relationships(name)};
      };`;
}

function viewBlock(name: string, cols: Col[]): string {
  const row = cols
    .map((c) => `${indent(10)}${c.column_name}: ${colType({ ...c, nullable: true })};`)
    .join("\n");
  return `      ${name}: {
        Row: {
${row}
        };
        Relationships: [];
      };`;
}

function funcBlock(f: Func): string {
  const args =
    f.arg_types.length === 0
      ? "Record<PropertyKey, never>"
      : `{ ${f.arg_types.map((t, i) => `${f.arg_names[i] ?? `arg${i}`}: ${pgType(t)}`).join("; ")} }`;
  const ret = f.return_type === "void" ? "undefined" : pgType(f.return_type);
  return `      ${f.name}: { Args: ${args}; Returns: ${ret} };`;
}

const tables = [...byTable].filter(([, c]) => c[0].table_type === "BASE TABLE");
const views = [...byTable].filter(([, c]) => c[0].table_type === "VIEW");
// Funzioni che accettano un record di tabella come argomento non sono chiamabili via RPC.
const funcs = meta.funcs.filter((f) => !f.arg_types.some((t) => byTable.has(t)));

const out = `// GENERATO da scripts/gen-types.mts — non modificare a mano.
// Rigenera dopo ogni migrazione: DATABASE_URL=… pnpm db:types:local

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
${tables.map(([n, c]) => tableBlock(n, c)).join("\n")}
    };
    Views: {
${views.map(([n, c]) => viewBlock(n, c)).join("\n")}
    };
    Functions: {
${funcs.map(funcBlock).join("\n")}
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
`;

writeFileSync("lib/supabase/database.types.ts", out);
console.log(
  `Tipi generati: ${tables.length} tabelle, ${views.length} viste, ${funcs.length} funzioni.`,
);
