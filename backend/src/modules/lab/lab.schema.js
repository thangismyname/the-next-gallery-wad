import { z } from "zod";

// Lab: tên experiment / run / file CSV — cùng regex với ai-service app/api/lab.py.
const labName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/, "Tên không hợp lệ");
export const labExpParamsSchema = z.object({ exp: labName });
export const labRunParamsSchema = z.object({ exp: labName, runId: labName });
export const labFileParamsSchema = z.object({
  exp: labName,
  runId: labName,
  name: labName.refine((n) => n.endsWith(".csv"), "Chỉ đọc file .csv"),
});

// Runner: job = các bước `python -m experiments <cmd>` (ai-service lab_runner.py kiểm tiếp tên lệnh + tham số).
const paramValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
export const labJobSchema = z.object({
  label: z.string().max(120).optional(),
  steps: z
    .array(
      z.object({
        cmd: labName,
        params: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,40}$/), z.union([paramValue, z.array(paramValue).max(100)])).default({}),
        save_as: z.string().regex(/^[A-Z][A-Z0-9_]{0,23}$/).optional(),
      }),
    )
    .min(1)
    .max(60),
});
export const labJobParamsSchema = z.object({ jobId: labName });

// Suite (bước + model + override) → ai-service experiments.jobs build_suite kiểm chi tiết; ở đây chỉ chặn cỡ.
export const labPlanSchema = z.object({
  options: z.record(z.string().max(40), z.unknown()).refine((o) => JSON.stringify(o).length <= 20000, "Tuỳ chọn quá lớn"),
});
