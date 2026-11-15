"""Gắn tag nội dung: 17 tag danh mục (taxonomy.py) + 174 nhãn chi tiết Open Images (labels.py).

Model .npz app dùng nằm trong app/tagging/probes/ (commit vào repo — vài trăm KB),
được chép từ bench/runs/cls (17 tag) hoặc xuất bằng `experiments export_tags` (174 nhãn).
"""
from app.tagging.tagger import Tagger

__all__ = ["Tagger"]
