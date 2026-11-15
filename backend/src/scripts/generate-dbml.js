// Sinh database/pipeline/schema.dbml từ DB đang chạy (cấu trúc + COMMENT của schema.sql).
//   npm run db:dbml   (DB lấy từ .env). Bản chuẩn: chạy trên DB mới tạo — DB dev cũ
//   có thứ tự cột + COMMENT cũ khác chút do được ALTER dần.
import "../config/env.js";
import fs from "node:fs/promises";
import { dbPool as db } from "../config/db.js";

const q = async (s) => (await db.query(s)).rows;
const tables = await q(`SELECT c.relname t, obj_description(c.oid) note FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' ORDER BY (c.relname IN ('user','session','account','verification')) DESC, c.oid`);
const cols = await q(`SELECT c.relname t, a.attname col, format_type(a.atttypid,a.atttypmod) typ, a.attnotnull nn,
  pg_get_expr(d.adbin,d.adrelid) def, col_description(c.oid,a.attnum) note, a.attnum
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.oid, a.attnum`);
const cons = await q(`SELECT c.conrelid::regclass::text t, c.contype, c.conkey, c.confrelid::regclass::text ft, c.confkey, c.confdeltype
  FROM pg_constraint c WHERE c.connamespace='public'::regnamespace AND c.contype IN ('p','u','f')`);
const attname = Object.fromEntries(cols.map((c) => [`${c.t}.${c.attnum}`, c.col]));
const unq = (t) => t.replace(/"/g, "");
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ");
const out = [`// ==========================================================
// schema.dbml — The Next Gallery
// SINH TỰ ĐỘNG từ DB (schema.sql + migrate.js) — đừng sửa tay. Paste vào
// https://dbdiagram.io để vẽ ERD. Note = COMMENT trong schema.sql.
// 4 bảng đầu (user/session/account/verification) do Better Auth quản lý.
// ==========================================================
`];
for (const { t, note } of tables) {
  const tc = cons.filter((c) => unq(c.t) === t);
  const pk = tc.find((c) => c.contype === "p")?.conkey ?? [];
  const single = (type) => new Set(tc.filter((c) => c.contype === type && c.conkey.length === 1).map((c) => c.conkey[0]));
  const u1 = single("u");
  const fks = Object.fromEntries(tc.filter((c) => c.contype === "f" && c.conkey.length === 1).map((c) => [c.conkey[0], c]));
  out.push(`Table ${t} {`);
  for (const c of cols.filter((c) => c.t === t)) {
    const s = [];
    if (pk.includes(c.attnum) && pk.length === 1) s.push("pk");
    else if (c.nn) s.push("not null");
    if (u1.has(c.attnum)) s.push("unique");
    if (c.def) s.push(`default: \`${c.def}\``);
    const fk = fks[c.attnum];
    if (fk) s.push(`ref: > ${unq(fk.ft)}.${attname[`${unq(fk.ft)}.${fk.confkey[0]}`]}`);
    if (c.note) s.push(`note: '${esc(c.note)}'`);
    const typ = c.typ.replace(/^timestamp with time zone$/, "timestamptz").replace(/^timestamp without time zone$/, "timestamp")
      .replace(/^character varying/, "varchar").replace(/^character\(/, "char(").replace(/^USER-DEFINED$/, "enum");
    out.push(`  ${c.col} "${typ}"${s.length ? ` [${s.join(", ")}]` : ""}`);
  }
  const multi = tc.filter((c) => (c.contype === "u" || c.contype === "p") && c.conkey.length > 1);
  if (multi.length) {
    out.push("", "  indexes {");
    for (const m of multi) out.push(`    (${m.conkey.map((k) => attname[`${t}.${k}`]).join(", ")}) [${m.contype === "p" ? "pk" : "unique"}]`);
    out.push("  }");
  }
  if (note) out.push("", `  Note: '${esc(note)}'`);
  out.push("}", "");
}
// composite FKs (if any) as Ref lines
for (const c of cons.filter((c) => c.contype === "f" && c.conkey.length > 1))
  out.push(`Ref: ${unq(c.t)}.(${c.conkey.map((k) => attname[`${unq(c.t)}.${k}`]).join(", ")}) > ${unq(c.ft)}.(${c.confkey.map((k) => attname[`${unq(c.ft)}.${k}`]).join(", ")})`);

const target = new URL("../../../database/pipeline/schema.dbml", import.meta.url);
await fs.writeFile(target, out.join("\n").trimEnd() + "\n");
console.log(`Đã ghi ${tables.length} bảng → database/pipeline/schema.dbml`);
await db.end();
