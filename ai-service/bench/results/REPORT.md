# Benchmark report

_Sinh tự động bởi `bench/report.py` lúc 2026-10-24T12:07:01Z._


## Tái lập YOLOv10 (paper Table 1) — COCO val2017

AP50-95 (%). Paper: AP chính = NMS-free, AP† = one-to-many + NMS.

| Model | Head | Device | AP (công bố) | AP (của tôi, pycocotools) | Δ | AP (Ultralytics) |
|---|---|---|---|---|---|---|
| yolov10n | NMS-free (e2e) | mps | 38.5 | 38.5 | +0.0 | 38.0 |
| yolov10n | one-to-many + NMS | mps | 39.5 | 39.5 | -0.0 | 38.9 |

## Tái lập YOLO26 (Ultralytics docs) — COCO val2017

AP50-95 (%). Docs: cột mAPval 50-95 = + NMS, cột (e2e) = NMS-free.

| Model | Head | Device | AP (công bố) | AP (của tôi, pycocotools) | Δ | AP (Ultralytics) |
|---|---|---|---|---|---|---|
| yolo26n | NMS-free (e2e) | mps | 40.1 | 40.1 | -0.0 | 39.5 |
| yolo26n | one-to-many + NMS | mps | 40.9 | 40.8 | -0.1 | 40.2 |

## YOLOv10 vs YOLO26 (đo trên máy này)

Cùng máy, cùng protocol: COCO val2017 5000 ảnh, 640 px; latency = inference + hậu xử lý, batch 1, MPS (bench/yolo_latency.py).

| Model | Params (M) | AP e2e | AP + NMS | Latency e2e (ms) | Latency + NMS (ms) |
|---|---|---|---|---|---|
| yolov10n | 2.3 | 38.5 | 39.5 | 24.40 | 17.99 |
| yolo26n | 2.4 | 40.1 | 40.8 | 22.65 | 20.25 |

## Latency: NMS-free vs NMS (luận điểm chính của YOLOv10)

Latency end-to-end batch 1 (ms), 640 px, conf 0.25. Cột công bố đo trên T4 TensorRT FP16 — khác phần cứng, chỉ dùng để đối chiếu tỉ lệ.

| Model | Device | e2e mean | e2e p95 | NMS mean | NMS p95 | NMS / e2e | Công bố (T4 TRT) |
|---|---|---|---|---|---|---|---|
| yolov10n | mps | 24.40 | 28.16 | 17.99 | 21.55 | 0.74× | 1.84 |
| yolo26n | mps | 22.65 | 24.11 | 20.25 | 24.07 | 0.89× | 1.70 |

## Tái lập DINOv3 — Revisited Oxford/Paris

Instance retrieval, CLS token + cosine (DINOv3 paper Table 14, cột Ox.-H; App. D.8: cạnh lớn 224 px + đệm đen 224×224). Δ chỉ tính cho preprocess=pad224 (cả hai cách crop query). square224/app = đường đi ảnh của app; clip-app = CLIP của semantic search (không có số công bố).

| Model | Size | Params (M) | Dataset | Ảnh | Query | mAP E/M/H | Paper H | Δ H | Ảnh/s | Latency b1 (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| dinov3-vits16 | S | 21.6 | roxford5k | app | bbox | 80.1/64.6/42.9 | 49.5 | – | 98.1 | 17.6 |
| dinov3-vits16 | S | 21.6 | roxford5k | app | full | 89.6/75.1/51.7 | 49.5 | – | 98.1 | 17.6 |
| dinov3-vits16 | S | 21.6 | roxford5k | long224 | bbox | 78.7/63.6/42.4 | 49.5 | – | 175.7 | 13.4 |
| dinov3-vits16 | S | 21.6 | roxford5k | long224 | full | 88.6/73.4/48.7 | 49.5 | – | 175.7 | 13.4 |
| dinov3-vits16 | S | 21.6 | roxford5k | pad224 | bbox | 80.1/63.5/41.8 | 49.5 | -7.7 | 155.2 | 13.9 |
| dinov3-vits16 | S | 21.6 | roxford5k | pad224 | full | 89.2/74.0/49.4 | 49.5 | -0.1 | 155.2 | 13.9 |
| dinov3-vits16 | S | 21.6 | roxford5k | square224 | bbox | 79.2/63.9/42.5 | 49.5 | – | 145.1 | 13.9 |
| dinov3-vits16 | S | 21.6 | roxford5k | square224 | full | 89.2/74.4/50.4 | 49.5 | – | 145.1 | 13.9 |
| dinov3-vits16plus | S+ | 28.7 | roxford5k | pad224 | bbox | 83.1/67.7/44.8 | 50.0 | -5.2 | 131.6 | 16.2 |
| dinov3-vits16plus | S+ | 28.7 | roxford5k | pad224 | full | 90.1/74.6/50.2 | 50.0 | +0.2 | 131.6 | 16.2 |
| dinov3-vitb16 | B | 85.7 | roxford5k | pad224 | bbox | 87.7/74.1/55.2 | 58.5 | -3.3 | 64.2 | 25.2 |
| dinov3-vitb16 | B | 85.7 | roxford5k | pad224 | full | 93.7/80.4/58.8 | 58.5 | +0.3 | 64.2 | 25.2 |
| dinov2-small | S | 22.1 | roxford5k | pad224 | bbox | 71.1/57.6/35.4 | 39.5 | -4.1 | 149.3 | 14.9 |
| dinov2-small | S | 22.1 | roxford5k | pad224 | full | 85.2/68.6/43.0 | 39.5 | +3.5 | 149.3 | 14.9 |
| dinov2reg-small | S | 22.1 | roxford5k | pad224 | bbox | 75.0/57.9/33.0 | 39.5 | -6.5 | 157.2 | 24.3 |
| dinov2reg-small | S | 22.1 | roxford5k | pad224 | full | 86.8/67.4/38.0 | 39.5 | -1.5 | 157.2 | 24.3 |
| dinov2-base | B | 86.6 | roxford5k | pad224 | bbox | 80.0/64.0/41.7 | 51.0 | -9.3 | 64.8 | 26.1 |
| dinov2-base | B | 86.6 | roxford5k | pad224 | full | 87.1/72.6/49.5 | 51.0 | -1.4 | 64.8 | 26.1 |
| dinov2reg-base | B | 86.6 | roxford5k | pad224 | bbox | 82.7/66.9/46.4 | 51.0 | -4.6 | 61.6 | 47.4 |
| dinov2reg-base | B | 86.6 | roxford5k | pad224 | full | 89.2/73.6/50.9 | 51.0 | -0.1 | 61.6 | 47.4 |
| clip-app | B | 87.8 | roxford5k | openclip | bbox | 43.4/29.1/6.9 | – | – | 231.1 | 10.7 |
| clip-app | B | 87.8 | roxford5k | openclip | full | 63.7/43.8/12.4 | – | – | 231.1 | 10.7 |
| dinov3-vits16 | S | 21.6 | rparis6k | pad224 | bbox | 91.0/81.6/65.2 | – | – | 157.6 | 14.1 |
| dinov3-vits16 | S | 21.6 | rparis6k | pad224 | full | 92.5/84.3/68.5 | – | – | 157.6 | 14.1 |
| dinov3-vits16plus | S+ | 28.7 | rparis6k | pad224 | bbox | 92.8/85.0/69.2 | – | – | 131.6 | 16.0 |
| dinov3-vits16plus | S+ | 28.7 | rparis6k | pad224 | full | 94.4/87.0/72.9 | – | – | 131.6 | 16.0 |
| dinov3-vitb16 | B | 85.7 | rparis6k | pad224 | bbox | 94.5/88.9/76.2 | – | – | 64.3 | 25.4 |
| dinov3-vitb16 | B | 85.7 | rparis6k | pad224 | full | 96.0/90.9/80.0 | – | – | 64.3 | 25.4 |
| dinov2-small | S | 22.1 | rparis6k | pad224 | bbox | 90.7/81.6/64.8 | – | – | 150.0 | 13.9 |
| dinov2-small | S | 22.1 | rparis6k | pad224 | full | 93.3/84.6/68.4 | – | – | 150.0 | 13.9 |
| dinov2reg-small | S | 22.1 | rparis6k | pad224 | bbox | 90.9/82.1/66.0 | – | – | 156.4 | 24.4 |
| dinov2reg-small | S | 22.1 | rparis6k | pad224 | full | 92.0/83.8/68.0 | – | – | 156.4 | 24.4 |
| dinov2-base | B | 86.6 | rparis6k | pad224 | bbox | 94.3/88.4/75.0 | – | – | 64.7 | 26.0 |
| dinov2-base | B | 86.6 | rparis6k | pad224 | full | 95.1/90.2/78.6 | – | – | 64.7 | 26.0 |
| dinov2reg-base | B | 86.6 | rparis6k | pad224 | bbox | 93.7/88.3/75.0 | – | – | 62.6 | 47.0 |
| dinov2reg-base | B | 86.6 | rparis6k | pad224 | full | 95.0/90.6/79.1 | – | – | 62.6 | 47.0 |
| clip-app | B | 87.8 | rparis6k | openclip | bbox | 81.3/68.1/45.7 | – | – | 233.6 | 10.6 |
| clip-app | B | 87.8 | rparis6k | openclip | full | 82.6/70.7/48.4 | – | – | 233.6 | 10.6 |

## Classification T1 — cảnh (Places6)

T1 — phân loại cảnh 1 nhãn, Places365 val gom về 6 tag cảnh (chia 60/20/20 cố định). zs = zero-shot, lp = linear probe trên feature đóng băng, yolo26n_cls_ft = fine-tune toàn mạng. CI = bootstrap 1000 lần trên ảnh test: hai cấu hình có CI không chồng nhau mới chắc chắn khác nhau. Feature ms = thời gian model trích feature (app đã tính sẵn lúc upload).

| Cấu hình | Feature | Train | Test | Top-1 [95% CI] | Top-2 | Macro-F1 [95% CI] | ECE ↓ | Val macro-F1 | Train (s) | Classifier ms/ảnh | Feature ms/ảnh |
|---|---|---|---|---|---|---|---|---|---|---|---|
| zs_clip | clip | 3521 | 1126 | 80.6 [78.4–83.0] | 94.1 | 79.7 [77.3–82.0] | 11.4 | 81.3 | 6.6 | 0.002 | 4.8 |
| lp_yolo | yolo | 3521 | 1126 | 43.2 [40.3–46.1] | 62.8 | 37.4 [34.8–39.9] | 4.3 | 39.2 | 0.3 | 0.002 | 21.0 |
| lp_clip | clip | 3521 | 1126 | 86.6 [84.5–88.5] | 97.0 | 85.9 [83.7–88.0] | 8.8 | 88.2 | 0.6 | 0.004 | 4.8 |
| lp_dino | dino | 3521 | 1126 | 86.2 [84.2–88.2] | 96.0 | 85.5 [83.4–87.5] | 14.3 | 87.5 | 0.3 | 0.002 | 7.3 |
| lp_clip_dino | clip+dino | 3521 | 1126 | 87.9 [86.1–89.8] | 97.2 | 87.1 [85.0–89.1] | 1.9 | 89.0 | 0.8 | 0.002 | 12.1 |
| lp_all | clip+dino+yolo | 3521 | 1126 | 87.6 [85.6–89.5] | 97.4 | 86.8 [84.8–89.0] | 6.0 | 88.8 | 1.0 | 0.003 | 33.1 |
| yolo26n_cls_ft | image (fine-tune toàn mạng) | 3521 | 1126 | 82.0 [79.8–84.2] | 93.6 | 80.9 [78.5–83.2] | 11.5 | – | 642.0 | 8.370 | 0.0 |

## Classification T1 — ma trận nhầm lẫn (lp_clip_dino)

Ma trận nhầm lẫn T1 (% theo hàng) của cấu hình tốt nhất `lp_clip_dino`. Đường chéo = recall; ô ngoài đường chéo lớn = cặp cảnh hay bị nhầm.

| Thật \ Dự đoán | Biển | Núi | Thiên nhiên | Đường phố | Kiến trúc | Trong nhà | Số ảnh |
|---|---|---|---|---|---|---|---|
| Biển | 82 | 4 | 10 | 0 | 3 | 1 | 119 |
| Núi | 8 | 84 | 7 | 1 | 1 | 0 | 182 |
| Thiên nhiên | 2 | 10 | 85 | 1 | 3 | 0 | 189 |
| Đường phố | 1 | 2 | 1 | 85 | 8 | 4 | 164 |
| Kiến trúc | 0 | 2 | 4 | 5 | 89 | 0 | 235 |
| Trong nhà | 0 | 0 | 0 | 2 | 0 | 97 | 237 |

## Classification T1 — theo từng tag cảnh

F1 (%) theo từng tag trên tập test. Dùng để xem mỗi model mạnh ở loại tag nào.

| Tag | Ảnh test | zs_clip | lp_yolo | lp_clip | lp_dino | lp_clip_dino | lp_all | yolo26n_cls_ft | Tốt nhất (F1) |
|---|---|---|---|---|---|---|---|---|---|
| Biển | 119 | 76 | 23 | 83 | 83 | 83 | 84 | 76 | lp_all |
| Núi | 182 | 74 | 7 | 85 | 83 | 84 | 83 | 77 | lp_clip |
| Thiên nhiên | 189 | 82 | 23 | 83 | 80 | 84 | 84 | 77 | lp_all |
| Đường phố | 164 | 74 | 48 | 82 | 83 | 86 | 85 | 78 | lp_clip_dino |
| Kiến trúc | 235 | 78 | 43 | 86 | 87 | 89 | 88 | 82 | lp_clip_dino |
| Trong nhà | 237 | 94 | 80 | 97 | 96 | 97 | 97 | 96 | lp_clip_dino |

## Classification T2 — gắn tag nhiều nhãn

T2 — gắn tag nhiều nhãn: COCO val2017 → 7 tag đối tượng (nhãn suy từ annotation; yolo_rule dùng cùng luật nên có lợi thế trên COCO). gallery = hệ thống 17 tag trên ảnh đã duyệt; system:best = mỗi nhóm tag dùng cấu hình có điểm val cao nhất. F1 tại ngưỡng / tag chọn trên val.

| Dataset | Cấu hình | Feature | Train | Test | mAP [95% CI] | Macro-F1 [95% CI] | Micro-F1 | ECE ↓ | Val mAP | Thành phần (system) |
|---|---|---|---|---|---|---|---|---|---|---|
| coco | zs_clip | clip | 3007 | 977 | 77.0 [74.7–79.6] | 72.8 [70.6–75.0] | 71.4 | 10.4 | 75.4 |  |
| coco | yolo_rule | yolo | 3007 | 977 | 87.4 [85.2–89.5] | 87.1 [85.2–88.8] | 86.6 | 3.2 | 87.9 |  |
| coco | lp_yolo | yolo | 3007 | 977 | 90.0 [87.9–92.0] | 86.1 [84.0–87.8] | 86.0 | 0.9 | 89.8 |  |
| coco | lp_clip | clip | 3007 | 977 | 90.0 [88.0–91.7] | 83.7 [81.8–85.5] | 82.8 | 1.2 | 91.3 |  |
| coco | lp_dino | dino | 3007 | 977 | 90.3 [88.4–92.0] | 83.8 [81.8–85.7] | 83.5 | 1.6 | 88.6 |  |
| coco | lp_clip_dino | clip+dino | 3007 | 977 | 92.0 [90.2–93.5] | 85.5 [83.6–87.1] | 85.1 | 2.1 | 92.4 |  |
| coco | lp_all | clip+dino+yolo | 3007 | 977 | 93.2 [91.7–94.6] | 86.6 [84.6–88.2] | 86.0 | 1.6 | 93.2 |  |

## Classification T2 — theo từng tag đối tượng

F1 / AP (%) theo từng tag trên tập test. Dùng để xem mỗi model mạnh ở loại tag nào.

| Tag | Ảnh test | zs_clip | yolo_rule | lp_yolo | lp_clip | lp_dino | lp_clip_dino | lp_all | Tốt nhất (F1) |
|---|---|---|---|---|---|---|---|---|---|
| Chân dung | 143 | 46 / 50 | 82 / 81 | 79 / 79 | 65 / 72 | 72 / 80 | 71 / 79 | 72 / 81 | yolo_rule |
| Nhóm người | 229 | 59 / 65 | 83 / 87 | 83 / 89 | 74 / 84 | 76 / 85 | 79 / 87 | 79 / 89 | lp_yolo |
| Thú cưng | 54 | 81 / 84 | 87 / 82 | 84 / 87 | 84 / 89 | 81 / 88 | 83 / 91 | 87 / 93 | lp_all |
| Động vật | 113 | 82 / 87 | 93 / 94 | 89 / 94 | 93 / 95 | 88 / 91 | 92 / 95 | 91 / 96 | lp_clip |
| Đồ ăn | 119 | 83 / 84 | 87 / 91 | 90 / 94 | 91 / 96 | 91 / 96 | 91 / 97 | 91 / 98 | lp_clip_dino |
| Phương tiện | 144 | 77 / 83 | 91 / 94 | 87 / 91 | 87 / 95 | 89 / 95 | 90 / 96 | 90 / 97 | yolo_rule |
| Thể thao | 198 | 82 / 86 | 87 / 83 | 91 / 96 | 93 / 98 | 90 / 97 | 92 / 98 | 94 / 99 | lp_all |
