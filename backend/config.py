"""
配置文件 - YOLO11 標籤標準化
與 app.py 的 YOLO11_CLASSES 對齊，作為 Single Source of Truth。
"""

# 標準標籤 → (顯示名稱, 顏色)
LABEL_REGISTRY = {
    "hardhat":         ("Hardhat",        "#00FF00"),
    "mask":            ("Mask",           "#00FF00"),
    "safety vest":     ("Safety Vest",    "#00FF00"),
    "no-hardhat":      ("NO-Hardhat",     "#FF0000"),
    "no-mask":         ("NO-Mask",        "#FF0000"),
    "no-safety vest":  ("NO-Safety Vest", "#FF0000"),
    "person":          ("Person",         "#00FFFF"),
    "safety cone":     ("Safety Cone",    "#00FFFF"),
    "machinery":       ("Machinery",      "#FFFF00"),
    "vehicle":         ("Vehicle",        "#FFFF00"),
    "utility pole":    ("Utility Pole",   "#FF6600"),
}

# 機具同義字 → Machinery 色
MACHINERY_ALIASES = {"excavator", "truck", "crane", "loader", "machine", "bulldozer", "forklift"}

# 人員同義字 → Person 色
PERSON_ALIASES = {"worker", "man", "human"}


def get_label_info(label: str):
    """
    根據 AI 校核回傳的標籤名稱獲取標準化的顯示名稱與顏色。

    Phase 3 防呆修正（2026-09-13）：先前發現 VLM 曾回傳詞彙表外的字串
    （例如 "Structural"），因為最後這行 `return {"name": label, ...}`
    來者不拒，把任何沒對上的字串都當成一個新的合法標籤直接接受、覆寫掉
    YOLO 原本的判斷——等於校核詞彙表形同虛設。現在改成回傳 None，呼叫端
    （app.py 的 verify_merge）看到 None 時必須保留原本的 YOLO 標籤，
    不能把未知字串當成有效校核結果套用。
    """
    if not label:
        return None

    key = label.strip().lower()

    if key in LABEL_REGISTRY:
        name, color = LABEL_REGISTRY[key]
        return {"name": name, "color": color}

    if key in PERSON_ALIASES or "hardhat" in key:
        return {"name": "Person", "color": "#00FFFF"}

    if key in MACHINERY_ALIASES:
        return {"name": label.capitalize(), "color": "#FFFF00"}

    # 詞彙表外的未知字串（例如模型偶爾回傳的 "Structural"）——不接受，
    # 讓呼叫端保留原始 YOLO 標籤，而不是把這個沒人定義過的字串當真標籤用。
    return None
