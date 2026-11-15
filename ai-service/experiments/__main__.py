"""CLI: `uv run python -m experiments <lệnh> [tham số]` (chạy từ ai-service/).

  status                 dữ liệu nào đã sẵn sàng, run mới nhất của từng thí nghiệm
  select | build         Part 0 — chọn subset Open Images, build nhãn sau khi tải ảnh
  e1 … e6                thí nghiệm (xem experiments/README.md)
  yolo_ft                fine-tune YOLO26n trên box Open Images (bản có train của E4)
  probe                  tag CÓ TRAIN: linear probe CLIP / DINO / CLIP+DINO+YOLO trên split train
  export_tags            đưa probe 174 nhãn Open Images (lp_clip) vào app (app/tagging/probes/)
  report                 bảng tổng hợp E1–E6 + lịch sử → Results/oi/REPORT.md
  judge                  mở trang chấm tay query ghép (E3c, E6) trên trình duyệt
  summary                tóm tắt dễ hiểu, version vNNN → Results/oi/SUMMARY.md (tự chạy sau mỗi run)
  schema [lệnh]          tham số dạng JSON (cho admin UI)
  runs <lệnh>            danh sách run (thư mục, trạng thái)
  archive <lệnh|bench>   lưu thủ công vào History/ (run mới nhất, hoặc ai-service/bench/results)

Mỗi lệnh nhận --help. Tham số cũng có thể đưa bằng --params-json '{"smoke": 50}'.
"""
from __future__ import annotations

import argparse
import json
import sys

from experiments import core


def registry() -> dict:
    """Lệnh → (lớp tham số, hàm chạy). Import muộn để `--help` nhanh."""
    from experiments import (
        e1_sanity,
        e2_clip_tag,
        e3_search,
        e4_yolo,
        e5_fusion,
        e6_hybrid,
        export_tags,
        judge_server,
        prepare,
        probe,
        report,
        summary,
        yolo_ft,
    )

    return {
        "select": (prepare.SelectParams, prepare.run_select, "Part 0a: chọn subset + danh sách tải ảnh"),
        "build": (prepare.BuildParams, prepare.run_build, "Part 0b: kiểm ảnh, build nhãn/box/caption"),
        "e1": (e1_sanity.E1Params, e1_sanity.run, "Sanity check CLIP retrieval (Flickr30k, COCO)"),
        "e2": (e2_clip_tag.E2Params, e2_clip_tag.run, "CLIP zero-shot tag"),
        "e3": (e3_search.E3Params, e3_search.run, "CLIP zero-shot search (a/b/c/d)"),
        "e4": (e4_yolo.E4Params, e4_yolo.run, "YOLO26 baseline"),
        "e5": (e5_fusion.E5Params, e5_fusion.run, "Hợp nhất tag YOLO + CLIP"),
        "yolo_ft": (yolo_ft.YoloFTParams, yolo_ft.run, "Fine-tune YOLO26n trên box Open Images (128 lớp vật thể)"),
        "probe": (probe.ProbeParams, probe.run, "Tag có train: linear probe (lp_clip … fused_learned)"),
        "export_tags": (export_tags.ExportTagsParams, export_tags.run,
                        "Đưa probe 174 nhãn (lp_clip) vào app → app/tagging/probes/oi-lp_clip.npz"),
        "e6": (e6_hybrid.E6Params, e6_hybrid.run, "Search lai tag + CLIP"),
        "report": (report.ReportParams, report.run, "Báo cáo tổng hợp E1–E6 → Results/oi/REPORT.md"),
        "judge": (judge_server.JudgeParams, judge_server.run, "Trang chấm tay query ghép → judgments.csv"),
        "summary": (summary.SummaryParams, summary.run, "Tóm tắt dễ hiểu theo version → Results/oi/SUMMARY.md"),
    }


def list_runs(data_root, exp: str) -> list[dict]:
    base = core.result_root(data_root) / exp
    out = []
    for d in sorted(base.iterdir() if base.exists() else [], reverse=True):
        status = d / "status.json"
        if d.is_dir() and status.exists():
            out.append({"run_id": d.name, "dir": str(d), **json.loads(status.read_text())})
    return out


def main(argv: list[str] | None = None) -> int:
    reg = registry()
    parser = argparse.ArgumentParser(prog="python -m experiments", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    st = sub.add_parser("status", help="Dữ liệu + run sẵn có")
    core.add_params_to_parser(st, core.CommonParams)
    sc = sub.add_parser("schema", help="Tham số JSON cho UI")
    sc.add_argument("name", nargs="?")
    ar = sub.add_parser("archive", help="Lưu vào History/ theo version")
    ar.add_argument("name", choices=[*reg, "bench"])
    ar.add_argument("--run-id", default="", help="Run cụ thể (trống = latest).")
    core.add_params_to_parser(ar, core.CommonParams)
    rn = sub.add_parser("runs", help="Danh sách run")
    rn.add_argument("name", choices=list(reg))
    core.add_params_to_parser(rn, core.CommonParams)
    for name, (cls, _, help_text) in reg.items():
        sp = sub.add_parser(name, help=help_text, description=help_text)
        core.add_params_to_parser(sp, cls)
        sp.add_argument("--params-json", default="", help="Tham số dạng JSON (ghi đè cờ).")

    args = vars(parser.parse_args(argv))
    cmd = args.pop("cmd")
    if cmd == "schema":
        names = [args["name"]] if args.get("name") else list(reg)
        print(json.dumps({n: {"help": reg[n][2], "params": core.params_schema(reg[n][0])} for n in names},
                         ensure_ascii=False, indent=2, default=str))
        return 0
    if cmd == "status":
        from experiments.prepare import status

        print(json.dumps(status(core.params_from(core.CommonParams, args)), ensure_ascii=False, indent=2))
        return 0
    if cmd == "archive":
        name, run_id = args.pop("name"), args.pop("run_id")
        p = core.params_from(core.CommonParams, args)
        if name == "bench":
            from bench.common import RESULTS_DIR

            target = core.archive_folder(RESULTS_DIR, "bench", p.root, p.note)
        else:
            target = core.archive_run(core.find_run(p.root, name, run_id), name, p.root)
        print(f"→ {target}")
        return 0
    if cmd == "runs":
        name = args.pop("name")
        p = core.params_from(core.CommonParams, args)
        print(json.dumps(list_runs(p.root, name), ensure_ascii=False, indent=2))
        return 0
    cls, fn, _ = reg[cmd]
    extra = json.loads(args.pop("params_json") or "{}")
    params = core.params_from(cls, {**args, **extra})
    fn(params)
    return 0


if __name__ == "__main__":
    sys.exit(main())
