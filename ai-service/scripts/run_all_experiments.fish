#!/usr/bin/env fish
# Re-runs E1–E6 + every fine-tuned YOLO variant in one go (no retraining). Stops at the first failure.
# Usage (from ai-service/): caffeinate -i fish scripts/run_all_experiments.fish 2>&1 | tee run_all.log

cd (dirname (status filename))/..
set -e TNG_DATASETS  # stale shells may point at the old Datasets folder
set R ../database/datasets/Results/oi

set FT_A yolo26n-oi-20261108-021431.pt  # plain fine-tune (main chain)
set FT_B yolo26n-oi-20261108-224401.pt  # pseudo-label
set FT_C yolo26n-oi-20261109-100541.pt  # pseudo-label + freeze 10

function newest
    ls $R/$argv[1] | string match -r '^\d{8}-\d{6}$' | tail -1
end

function x
    echo (date "+%H:%M:%S") "▶ experiments $argv"
    uv run python -m experiments $argv
    or begin
        echo "✗ FAILED: experiments $argv"
        exit 1
    end
end

x e1
x e2
x e3 --parts a b c
x e4

x yolo_ft --eval-only --weights $FT_A --no-latest
x yolo_ft --eval-only --weights $FT_B --no-latest
x yolo_ft --eval-only --weights $FT_C

x e4 --weights $FT_A --no-latest --note "E4 FT_A"; set E4_A (newest e4)
x e4 --weights $FT_B --no-latest --note "E4 FT_B"; set E4_B (newest e4)
x e4 --weights $FT_C --no-latest --note "E4 FT_C"; set E4_C (newest e4)

x e5 --e4-ft-run $E4_A
x e5 --e4-ft-run $E4_B --no-latest; set E5_B (newest e5)
x e5 --e4-ft-run $E4_C --no-latest; set E5_C (newest e5)

x probe
x probe --configs fused_learned --yolo $FT_A --no-latest; set P_A (newest probe)
x probe --configs fused_learned --yolo $FT_B --no-latest; set P_B (newest probe)
x probe --configs fused_learned --yolo $FT_C --no-latest; set P_C (newest probe)

x e6 --probe-ft-run $P_A
x e6 --e5-run $E5_B --probe-ft-run $P_B --no-latest --note "E6 FT_B"
x e6 --e5-run $E5_C --probe-ft-run $P_C --no-latest --note "E6 FT_C"

x report
x summary
echo (date "+%H:%M:%S") "✓ all done → $R/SUMMARY.md"
