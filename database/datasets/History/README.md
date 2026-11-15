# History — kết quả đo theo version

Mỗi thư mục con = 1 thí nghiệm. Mỗi lần chạy chính thức → 1 version không bao giờ ghi đè:

    <exp>/vNNN_<ngày-giờ>_<máy>_<commit>/   bản sao config.json, result.json, *.csv, artifacts/*.json
    <exp>/index.csv                          1 dòng / version: máy, commit, dữ liệu, tham số, metric chính

So sánh khi đổi máy / đổi dữ liệu / đổi tham số: mở index.csv (cột data_fingerprint cho biết
dữ liệu có khác không). Lưu tay: `uv run python -m experiments archive <exp>` (run mới nhất)
hoặc `archive bench` (chụp ai-service/bench/results).
