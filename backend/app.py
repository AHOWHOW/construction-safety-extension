"""
Construction Safety AI - FastAPI Backend
整合 YOLO 物體偵測 + Ollama Qwen3.5 分析
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import requests
import base64
import io
import json
import time
import threading
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
import numpy as np
from pdf_generator import pdf_generator
from config import get_label_info
from pathlib import Path

# ===== 設定 =====
OLLAMA_HOST = "http://localhost:11434"
# Phase 0 修正：qwen3.5 是文字模型命名，qwen3-vl 才是視覺語言模型。
# 分層模型：即時互動（網頁圖片分析／webcam 連續監控）用快的 4B；
# 使用者明確按下「匯出 PDF 報告」時，才用慢但比較穩的 8B 重新跑一次。
# 兩者都已用 diagnose.py／ollama ps 確認存在且吃滿 GPU。
OLLAMA_MODELS = {
    "fast": "qwen3-vl:4b",       # 網頁圖片分析、webcam 連續監控 — 預設值
    "quality": "qwen3-vl:8b",    # 匯出 PDF 報告時的重新分析
}
DEFAULT_TIER = "fast"

# Phase 0 修正（RC: port 衝突）：8000 被另一個叫 "edse"/"workbench" 的服務佔用，
# 診斷時 /health 回傳的完全是別的服務的 JSON。換一個不太會被別人用到的 port，
# 不要再賭誰先搶到 8000。
BACKEND_PORT = 8877

# Phase 0 新增：送給視覺語言模型的影像上限（長邊 px）。
# YOLO 走的是 pure_image（原始解析度），這個只影響「校核＋場景描述」那條路徑。
VLM_MAX_DIM = 1024
VLM_JPEG_QUALITY = 85

# Phase 0 新增：Ollama 呼叫參數。
# keep_alive=-1 => 模型常駐，不因閒置卸載重載（避免時快時慢的震盪）。
# num_ctx 明確給大一點，避免長 prompt + 影像 token 被靜默截斷。
OLLAMA_KEEP_ALIVE = -1
OLLAMA_NUM_CTX = 8192

# 使用絕對路徑確保從任何目錄啟動都能找到模型
SCRIPT_DIR = Path(__file__).parent
YOLO_MODEL_PATH = str(SCRIPT_DIR / "models" / "best_yolo11x.pt")

# ===== FastAPI 應用 =====
@asynccontextmanager
async def lifespan(_app: FastAPI):
    """應用生命週期：啟動時載入 YOLO11 模型"""
    print("🚀 Starting Construction Safety AI Backend...")
    print(f"📍 Ollama Host: {OLLAMA_HOST}")
    print(f"🤖 Ollama Model (fast/即時)   : {OLLAMA_MODELS['fast']}")
    print(f"🤖 Ollama Model (quality/匯出): {OLLAMA_MODELS['quality']}")
    print("🎯 YOLO Model: YOLO11 Construction Hazard Detection")
    load_yolo_model()
    print("✅ Backend ready!")
    yield


app = FastAPI(
    title="Construction Safety AI Backend",
    description="YOLO + Qwen3.5 工地安全監控後端服務",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 設定 - 允許 Chrome Extension 訪問
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"DEBUG: [Request] {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"DEBUG: [Response] {response.status_code}")
    return response

# 添加 no-cache middleware
@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    """添加 no-cache header 避免快取問題"""
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# ===== YOLO 模型載入 =====
yolo_model = None

# Phase 1（RC-1）：/api/analyze 等端點改成同步 def，讓 FastAPI/Starlette
# 自動丟到執行緒池執行，這樣一個請求在跑（尤其是等 Ollama 那幾秒到十幾秒）
# 不會卡住整個事件迴圈、擋住其他請求（包含 /health）。
# 但這也代表多個請求現在真的可能同時跑到這裡——Ultralytics 的同一個 model
# 實例不保證能被多執行緒同時呼叫 predict() 而不出問題，所以用這個鎖把「真正
# 呼叫模型」的那一小段（約 70-80ms）序列化，其餘（讀檔、解碼、Ollama 呼叫、
# 繪圖）仍可完全並行，不受影響。
yolo_inference_lock = threading.Lock()

def load_yolo_model():
    """載入 YOLO11 Construction Hazard Detection 模型"""
    global yolo_model

    try:
        from ultralytics import YOLO

        print("🔄 Loading YOLO11 Construction Hazard Detection model...")
        print(f"📍 Model path: {YOLO_MODEL_PATH}")

        yolo_model = YOLO(YOLO_MODEL_PATH)

        # Phase 0 新增：印出實際運算裝置，避免「以為在用 GPU、其實在用 CPU」
        try:
            import torch
            if torch.cuda.is_available():
                print(f"🖥️  Inference device: CUDA ({torch.cuda.get_device_name(0)})")
            else:
                print("🖥️  Inference device: CPU (⚠️ CUDA not available — will be slow)")
        except Exception as e:
            print(f"⚠️  Could not determine torch device: {e}")

        print("✅ YOLO11 model loaded successfully")
        print(f"📊 Model info: {yolo_model.model.names}")

    except FileNotFoundError:
        print(f"❌ Model file not found: {YOLO_MODEL_PATH}")
        print("💡 Please download the model first using: python download_model.py")
        yolo_model = None
    except Exception as e:
        print(f"❌ Error loading YOLO11 model: {e}")
        yolo_model = None

# ===== YOLO11 偵測類別定義 =====
# 來源: https://huggingface.co/yihong1120/Construction-Hazard-Detection-YOLO11
YOLO11_CLASSES = {
    0: {'name': 'Hardhat', 'color': '#00FF00'},          # 綠色 - 安全
    1: {'name': 'Mask', 'color': '#00FF00'},             # 綠色 - 安全
    2: {'name': 'NO-Hardhat', 'color': '#FF0000'},       # 紅色 - 違規
    3: {'name': 'NO-Mask', 'color': '#FF0000'},          # 紅色 - 違規
    4: {'name': 'NO-Safety Vest', 'color': '#FF0000'},   # 紅色 - 違規
    5: {'name': 'Person', 'color': '#00FFFF'},           # 青色 - 中性
    6: {'name': 'Safety Cone', 'color': '#00FFFF'},      # 青色 - 中性
    7: {'name': 'Safety Vest', 'color': '#00FF00'},      # 綠色 - 安全
    8: {'name': 'Machinery', 'color': '#FFFF00'},        # 黃色 - 設備
    9: {'name': 'Utility Pole', 'color': '#FF6600'},     # 橙色 - 警告（電氣危險）
    10: {'name': 'Vehicle', 'color': '#FFFF00'},         # 黃色 - 設備
}

# 使用者回饋（2026-09-13）：只有「人員 vs 機具/結構物」這種容易誤判的類別才需要
# 送進 VLM 盲測校核——這正是 analyze_with_ollama 那段 prompt 原本要解決的問題
# （腳手架/固定結構被錯判成 Machinery，或反過來）。PPE 類別（安全帽/口罩/背心
# 及其違規版本）跟 Safety Cone/Utility Pole 一律信任 YOLO 自己的分類、不送進盲測：
# VLM 的 verified_label 詞彙表本來就只有 Person|Excavator|Truck|Machinery|Other，
# 沒有涵蓋 PPE 類別，硬送進去只會被強制改標成 Person 或 Other，等於用另一種方式
# 把 PPE 資訊洗掉。
BLIND_TEST_CLASSES = {"Person", "Machinery", "Vehicle"}

# ===== 資料模型 =====
class Detection(BaseModel):
    bbox: List[float]  # [x, y, width, height]
    class_name: str
    confidence: float
    color: str

class AnalysisResult(BaseModel):
    scene_description: str
    hazards: List[dict]
    risk_level: str
    # Phase 3 新增：risk_level 現在是規則引擎算出來的，這兩個欄位讓前端可以
    # 顯示實際的「偵測危害機率×嚴重度」風險值，而不是只有一個沒有依據的字串。
    risk_score: int = 0        # 1~25（0 代表沒有命中任何規則）
    risk_percentage: int = 0   # 0~100
    recommendations: List[str]

class IntegratedResult(BaseModel):
    yolo_detections: Optional[List[Detection]]
    yolo_annotated_image: Optional[str]  # Base64
    ai_analysis: AnalysisResult

# Phase 2 新增：/api/detect 只回傳 YOLO 原始偵測結果（未經 VLM 校核），
# 給前端秒回用。之後同一張圖再送一次 /api/analyze 拿校核後的最終版本。
#
# Phase 3 擴充：risk_level 現在是純規則引擎算出來的（不需要等 VLM），
# 所以秒回階段就能直接附上正確的 hazards/risk_level——PPE 類別本來就
# 不送 VLM 盲測，這裡算出來的值就是最終值；只有涉及 Machinery/Vehicle
# 的距離類提示，可能在 VLM 校核完後跟著調整（例如某個「Machinery」被
# 校核成無效，提示就會消失）。
class DetectResult(BaseModel):
    yolo_detections: Optional[List[Detection]]
    yolo_annotated_image: Optional[str]  # Base64（用原始、未校核標籤畫的框）
    hazards: List[dict] = []
    risk_level: str = "low"
    risk_score: int = 0
    risk_percentage: int = 0

# ===== Phase 3：規則式風險引擎 =====
# 使用者提供了公司既有的「職安 DNA／W1×W2×W3 矩陣加權查驗表單系統」
# （N1~N9 九類危害因子、548 詞關鍵字權重字典、6,985 筆查驗項目）作為依據，
# 完整方法論、每個數字的來源與已知限制都寫在同目錄 RISK_ENGINE.md，
# 這裡只放實際計算會用到的表格與函式。修改嚴重度、門檻請對照該文件一併更新。
#
# 核心公式：風險值 = 偵測危害機率 L(1~5) × 嚴重度 C(1~5)，範圍 1~25。
# 「偵測危害機率」故意不叫「危害機率」——它是這次影像分析當下的證據強度
# （偵測信心值＋同類違規數量），不是套用通用職災統計算出來的真實事故機率，
# 避免工具過度宣稱準確度。

# 嚴重度 C：每個違規類別固定值，代表「如果真的發生，後果多嚴重」，
# 與偵測信心、數量無關。N-code 對照與依據見 RISK_ENGINE.md。
# 每條規則的 "confirmed_citation" 只放「已逐字查證過、可以放心引用」的正式
# 法規條文；None 代表這條目前還沒有查證過的確切法條號。這個欄位跟 "regulation"
# 分開存放，是因為 "regulation" 給人看時常常是一句話裡混著「已確認的部分」跟
# 「還待確認的部分」（例如同一條規則裡，吊掛物下方已查到條文、操作半徑還沒），
# 如果直接把整句丟給 VLM 當引用清單，模型會連同「待確認」的字樣一起學走、
# 誤以為那也是可以引用的內容。_build_regulation_reference_text() 只讀
# confirmed_citation，就不會有這個問題。
SAFETY_RULES = {
    "NO-Hardhat": {
        "n_code": "N2",
        "hazard_name": "未戴安全帽",
        "severity": 4,
        "regulation": "各工項查驗表列必要 PPE 項目（單一違規對應的確切法條號尚待人工確認，見 RISK_ENGINE.md）",
        "confirmed_citation": None,
        "description": "偵測到 {count} 名人員未戴安全帽，有物體飛落擊中頭部之虞。",
    },
    "NO-Safety Vest": {
        "n_code": "N2",
        "hazard_name": "未穿反光背心",
        "severity": 2,
        "regulation": "各工項查驗表列必要 PPE 項目（單一違規對應的確切法條號尚待人工確認，見 RISK_ENGINE.md）",
        "confirmed_citation": None,
        "description": "偵測到 {count} 名人員未穿反光背心，於車流或機具作業環境中可視性不足，有被撞風險。",
    },
    "NO-Mask": {
        "n_code": "N5/N9",
        "hazard_name": "未戴口罩",
        "severity": 1,
        "regulation": "電焊／噴凝土等特定作業之防護具規定（單一違規對應的確切法條號尚待人工確認，見 RISK_ENGINE.md）",
        "confirmed_citation": None,
        "description": "偵測到 {count} 名人員未戴口罩，若現場有電焊、噴凝土等產生粉塵或有害氣體之作業，應加強呼吸防護。",
    },
}

# 距離類規則：僅作「資訊性提示」，故意不計入 risk_level 的計算。
# 依據使用者自己的查驗項目原文（all_items.json）：「禁止人員（駕駛者除外）
# 進入操作半徑內」「禁止人員於吊掛物下方（文件原文：設施規則92、153條）」。
# 2026-09-13 已查證全國法規資料庫／臺北市法規查詢系統確認：文件裡的「設施規則」
# 是《職業安全衛生設施規則》（非《營造安全衛生設施標準》，兩者是不同的現行法規，
# 後者也仍然有效，2021-01-06 最新修正）；第92條逐字條文為「雇主對於起重機具之
# 運轉，應於運轉時採取防止吊掛物通過人員上方及人員進入吊掛物下方之設備或措施」，
# 第153條為「雇主對於搬運、堆放或處置物料，為防止倒塌、崩塌或掉落，應採取…
# 必要設施，並禁止與作業無關人員進入該等場所」——皆與「吊掛物下方」情境吻合。
# 「禁止人員進入操作半徑內」這句沒有查到逐字相符的條文，可能是查驗表自己的
# 精簡說法或散見其他條文，仍標示待確認，沒有自己編一個看起來像的條號。
# 這些規定本身都是質性描述（不可進入機具作業/迴轉半徑／吊掛物下方），沒有查到
# 可換算的固定公尺數門檻。2D 影像的 bbox 距離無法反映真實三維淨空，容易誤報，
# 所以只顯示提示、不拉高風險等級。
PROXIMITY_RULES = [
    {
        "classes": ("Person", "Machinery"),
        "n_code": "N8+N7",
        "hazard_name": "人員與機具距離過近",
        "severity": 4,
        "regulation": "《職業安全衛生設施規則》第92條、第153條（吊掛物下方／物料堆放禁止無關人員進入，已於2026-09-13查證條文原文確認）；「禁止人員進入操作半徑內」一句尚未查到逐字相符條文，待您確認",
        "confirmed_citation": "《職業安全衛生設施規則》第92條（雇主對於起重機具之運轉，應採取防止吊掛物通過人員上方及人員進入吊掛物下方之設備或措施）、第153條（雇主對於搬運、堆放或處置物料，應採取必要設施防止倒塌、崩塌或掉落，並禁止與作業無關人員進入該等場所）",
        "description": "偵測到人員與機具距離接近，依規定人員不得進入機具操作半徑內或吊掛物下方——僅供提示，2D 影像無法確認實際三維淨空，請現場人員自行確認。",
    },
    {
        "classes": ("Person", "Vehicle"),
        "n_code": "N8",
        "hazard_name": "人員與車輛距離過近",
        "severity": 4,
        "regulation": "文件原文：「禁止人員（駕駛者除外）進入操作半徑內」——尚未查到逐字相符條文，待您確認（92、153條為吊掛物情境，不完全對應此句）",
        "confirmed_citation": None,
        "description": "偵測到人員與車輛距離接近——僅供提示，2D 影像無法確認實際三維淨空，請現場人員自行確認。",
    },
    {
        "classes": ("Person", "Utility Pole"),
        "n_code": "N3",
        "hazard_name": "人員接近電桿（感電風險）",
        "severity": 4,
        "regulation": "職業安全衛生設施規則－架空電線接近界線距離相關規定（確切條號待您確認）",
        "confirmed_citation": None,
        "description": "偵測到人員與電桿／架空線路距離接近，如涉及高壓電路請保持法定接近界線距離——僅供提示，2D 影像無法確認實際淨空。",
    },
]

# 風險值（1~25）→ 低/中/高 門檻，先抓一個經驗值，可依實際使用回饋調整
# （呼應使用者自己那套系統裡「min_score 是經驗值，可調」的做法）。
RISK_LEVEL_THRESHOLDS = [(16, "high"), (9, "medium"), (1, "low")]


def _detected_probability(confidence: float, count: int, max_bonus: int = 2) -> int:
    """
    偵測危害機率 L（1~5）＝ 偵測信心值換算的基礎分量 ＋ 同類違規數量加成。

    信心值只代表「這個偵測是不是真的」，不是這件事有多危險（那是嚴重度 C 的
    工作）——所以這裡只把 confidence 線性映射到 1~5，不參考類別。
    YOLO 呼叫時 conf=0.5 為門檻，故 confidence 實際範圍是 0.5~1.0。
    """
    conf = max(0.5, min(1.0, confidence))
    conf_component = 1 + (conf - 0.5) / 0.5 * 4  # 0.5→1, 1.0→5
    count_bonus = min(max(count - 1, 0), max_bonus)
    return max(1, min(5, round(conf_component) + count_bonus))


def _band_risk_level(score: int) -> str:
    for threshold, label in RISK_LEVEL_THRESHOLDS:
        if score >= threshold:
            return label
    return "low"


def _bbox_gap(bbox1: List[float], bbox2: List[float]) -> float:
    """兩個 bbox 之間最短的邊對邊距離；重疊或相鄰回傳 0。"""
    x1, y1, w1, h1 = bbox1
    x2, y2, w2, h2 = bbox2
    ax2, ay2 = x1 + w1, y1 + h1
    bx2, by2 = x2 + w2, y2 + h2
    dx = max(x2 - ax2, x1 - bx2, 0)
    dy = max(y2 - ay2, y1 - by2, 0)
    return (dx ** 2 + dy ** 2) ** 0.5


def compute_rule_based_hazards(detections: List[Detection]) -> dict:
    """
    Phase 3 核心：從最終偵測清單直接算出 hazards + risk_level，取代先前
    完全交給 VLM 自由文字判斷的做法。同一張圖可能命中多條規則，risk_level
    採「最高風險值者勝出」，且只有「非資訊性」的規則會參與這個判斷
    （距離類規則故意排除，理由見 PROXIMITY_RULES 上方註解）。

    回傳: {"hazards": [...], "risk_level": str, "risk_score": int, "risk_percentage": int}
    """
    hazards: List[dict] = []

    # --- PPE 類：依類別分組，count 用於偵測危害機率的加成 ---
    by_class: dict = {}
    for det in detections:
        by_class.setdefault(det.class_name, []).append(det)

    for class_name, rule in SAFETY_RULES.items():
        dets = by_class.get(class_name, [])
        if not dets:
            continue
        count = len(dets)
        avg_conf = sum(d.confidence for d in dets) / count
        L = _detected_probability(avg_conf, count)
        C = rule["severity"]
        score = L * C
        hazards.append({
            "description": rule["description"].format(count=count),
            "severity": _band_risk_level(score),
            "n_code": rule["n_code"],
            "hazard_name": rule["hazard_name"],
            "regulation": rule["regulation"],
            "detected_probability": L,
            "severity_score": C,
            "risk_score": score,
            "risk_percentage": round(score / 25 * 100),
            "informational": False,
            "source": "rule",
        })

    # --- 距離類：資訊性提示，不計入 risk_level ---
    for prox_rule in PROXIMITY_RULES:
        cls_a, cls_b = prox_rule["classes"]
        group_a = by_class.get(cls_a, [])
        group_b = by_class.get(cls_b, [])
        if not group_a or not group_b:
            continue

        # 取所有配對中「最接近」的一組，用它的距離跟信心值代表這條規則的強度。
        best = None
        for a in group_a:
            for b in group_b:
                gap = _bbox_gap(a.bbox, b.bbox)
                person_h = a.bbox[3] if cls_a == "Person" else b.bbox[3]
                if best is None or gap < best[0]:
                    best = (gap, a, b, person_h)
        if best is None:
            continue
        gap, a, b, person_h = best
        if person_h <= 0:
            continue

        # 用人員身高當比例尺，粗略判斷「距離接近」；門檻刻意保守（見規則上方註解）。
        if gap < 0.5 * person_h:
            L = 3
        elif gap < 1.0 * person_h:
            L = 2
        else:
            continue  # 距離夠遠，不產生提示，避免雜訊

        C = prox_rule["severity"]
        score = L * C
        hazards.append({
            "description": prox_rule["description"],
            "severity": _band_risk_level(score),
            "n_code": prox_rule["n_code"],
            "hazard_name": prox_rule["hazard_name"],
            "regulation": prox_rule["regulation"],
            "detected_probability": L,
            "severity_score": C,
            "risk_score": score,
            "risk_percentage": round(score / 25 * 100),
            "informational": True,
            "source": "rule",
        })

    # risk_level 只看「非資訊性」規則命中的最高風險值
    scoring_hazards = [h for h in hazards if not h["informational"]]
    top_score = max((h["risk_score"] for h in scoring_hazards), default=0)

    return {
        "hazards": hazards,
        "risk_level": _band_risk_level(top_score) if top_score > 0 else "low",
        "risk_score": top_score,
        "risk_percentage": round(top_score / 25 * 100),
    }


def _build_regulation_reference_text() -> str:
    """
    彙整 SAFETY_RULES／PROXIMITY_RULES 裡「已查證確認」的正式法規條文，
    供匯出 PDF（quality tier）時放進 VLM prompt 當作可引用的依據清單。

    只讀每條規則的 confirmed_citation 欄位（None 就跳過）——這個欄位跟給人看的
    "regulation" 欄位分開存放，因為 "regulation" 常常是「已確認部分」跟「還待
    確認部分」混在同一句話裡（例如同一條規則裡，吊掛物下方已查到條文、操作
    半徑還沒查到），直接把整句丟給模型會連「待確認」的字樣一起學走，誤以為
    那也是可以引用的內容。confirmed_citation 只放逐字查證過、可以放心引用的
    條文，就不會有這個問題。2026-09-13 法規查證後，目前唯一進得了這份清單的
    是《職業安全衛生設施規則》第92條、第153條（見 RISK_ENGINE.md）。之後補上
    更多查證結果，只要填對應規則的 confirmed_citation，這份清單會自動變長，
    不需要另外改 prompt 的寫法。
    """
    lines = []
    seen = set()
    for rule in list(SAFETY_RULES.values()) + list(PROXIMITY_RULES):
        citation = rule.get("confirmed_citation")
        if not citation:
            continue
        key = (rule.get("n_code"), citation)
        if key in seen:
            continue
        seen.add(key)
        lines.append(f"- [{rule.get('n_code')}] {rule.get('hazard_name')}：{citation}")
    return "\n".join(lines)


# ===== YOLO 偵測功能 =====
def calculate_iou(bbox1: List[float], bbox2: List[float]) -> float:
    """計算兩個邊界框的 IoU（Intersection over Union）"""
    x1_1, y1_1, w1, h1 = bbox1
    x1_2, y1_2, w2, h2 = bbox2

    x2_1 = x1_1 + w1
    y2_1 = y1_1 + h1
    x2_2 = x1_2 + w2
    y2_2 = y1_2 + h2

    # 計算交集
    x_left = max(x1_1, x1_2)
    y_top = max(y1_1, y1_2)
    x_right = min(x2_1, x2_2)
    y_bottom = min(y2_1, y2_2)

    if x_right < x_left or y_bottom < y_top:
        return 0.0

    intersection = (x_right - x_left) * (y_bottom - y_top)
    area1 = w1 * h1
    area2 = w2 * h2
    union = area1 + area2 - intersection

    return intersection / union if union > 0 else 0.0


def run_yolo_detection(image: Image.Image) -> List[Detection]:
    """執行 YOLO11 偵測，僅返回偵測結果，不繪圖"""
    all_detections = []

    print("\n" + "="*80)
    print("🚀 Starting YOLO11 Detection")
    print("="*80)

    # 執行 YOLO11 偵測
    # Phase 1：序列化實際的模型呼叫（見 yolo_inference_lock 定義處說明）
    if yolo_model:
        with yolo_inference_lock:
            results = yolo_model(image, imgsz=640, conf=0.5)

        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf = float(box.conf[0])
                cls = int(box.cls[0])

                if cls in YOLO11_CLASSES:
                    class_info = YOLO11_CLASSES[cls]
                    detection = Detection(
                        bbox=[float(x1), float(y1), float(x2-x1), float(y2-y1)],
                        class_name=class_info['name'],
                        confidence=conf,
                        color=class_info['color']
                    )
                    all_detections.append(detection)
                    print(f"🔎 YOLO Candidate: {class_info['name']} (conf={conf:.3f})")

    # --- 跨類別標籤整合邏輯 (Inter-class NMS Optimization) ---
    # 使用者回饋（2026-09-13）：原本這裡「Person 跟 Safety Vest/Hardhat/Mask 重疊度
    # >0.7 就丟掉後者」的規則是錯的——安全帽戴在人員頭上、背心穿在人員身上，
    # 本來就會跟 Person 框高度重疊，這不是重複偵測，是兩個不同的物體（人＋他配戴的
    # PPE）。照舊規則會把「這個人有戴安全帽」這個最有價值的合規資訊直接刪掉，
    # 只留下一個乾淨的 Person 框，資訊反而被整併掉了。
    #
    # 現在只做「同類別」的重複抑制（例如同一個人被 YOLO 偵測成兩個高度重疊的
    # Person 框，才視為真正的重複），不同類別（Person+Hardhat、Person+Machinery
    # 等）一律都保留，各自是獨立的偵測結果。
    if all_detections:
        importance = {"Person": 10, "Machinery": 10, "Vehicle": 10}
        all_detections.sort(key=lambda x: (importance.get(x.class_name, 0), x.confidence), reverse=True)

        keep = []
        for det1 in all_detections:
            is_redundant = False
            for det2 in keep:
                if det1.class_name == det2.class_name and calculate_iou(det1.bbox, det2.bbox) > 0.7:
                    is_redundant = True
                    break
            if not is_redundant:
                keep.append(det1)
        all_detections = keep

    return all_detections

def draw_final_annotations(image: Image.Image, detections: List[Detection]) -> Image.Image:
    """根據最終核定結果繪製標註"""
    annotated_image = image.copy()
    draw = ImageDraw.Draw(annotated_image)
    try:
        font = ImageFont.truetype("arial.ttf", 16)
        font_small = ImageFont.truetype("arial.ttf", 12)
    except:
        font = ImageFont.load_default()
        font_small = ImageFont.load_default()

    for det in detections:
        # 如果是無效標籤則跳過
        if getattr(det, 'is_invalid', False):
            continue

        x, y, w, h = det.bbox
        x1, y1, x2, y2 = x, y, x + w, y + h
        draw.rectangle([x1, y1, x2, y2], outline=det.color, width=3)

        # 優先顯示已被 AI 修正的 class_name
        label = f"{det.class_name}"
        draw.text((x1, y1 - 20), label, fill=det.color, font=font)

    return annotated_image


def resize_for_vlm(image: Image.Image, max_dim: int = VLM_MAX_DIM, quality: int = VLM_JPEG_QUALITY) -> tuple:
    """
    Phase 0 新增：將影像縮小到長邊 <= max_dim 後再編碼，供視覺語言模型使用。
    YOLO 偵測仍走原始解析度的 pure_image，這裡只影響「送給 Ollama 的那張圖」。
    因為後續的區域座標是 0-1000 正規化座標（與解析度無關，只跟長寬比有關），
    縮小這張圖不影響 analyze_with_ollama 的座標比對邏輯。

    回傳: (base64_str, 縮小後寬, 縮小後高, 原始位元組數, 縮小後位元組數)
    """
    w, h = image.size
    scale = min(1.0, max_dim / max(w, h))
    if scale < 1.0:
        new_size = (max(1, round(w * scale)), max(1, round(h * scale)))
        resized = image.resize(new_size, Image.LANCZOS)
    else:
        resized = image

    # 供比較：原始尺寸若直接以相同品質編碼會是多大
    orig_buf = io.BytesIO()
    image.save(orig_buf, format="JPEG", quality=95)
    orig_bytes = len(orig_buf.getvalue())

    buf = io.BytesIO()
    resized.save(buf, format="JPEG", quality=quality)
    final_bytes = buf.getvalue()

    return (
        base64.b64encode(final_bytes).decode('utf-8'),
        resized.size[0],
        resized.size[1],
        orig_bytes,
        len(final_bytes),
    )


# ===== Ollama 分析功能 =====
def analyze_with_ollama(image_base64: str, detections: List[Detection], img_width: int, img_height: int,
                         model_name: str = OLLAMA_MODELS[DEFAULT_TIER],
                         tier: str = DEFAULT_TIER) -> dict:
    """
    使用 Ollama 視覺語言模型進行分析（model_name 由呼叫端依 tier 決定用 fast 還是 quality）

    2026-09-13 新增：tier == "quality"（也就是匯出 PDF 報告前的重新分析）時，
    prompt 會多帶一份「已查證確認的正式法規條文清單」，讓 recommendations
    可以視情況引用真實條文；fast tier（網頁/webcam 即時顯示）維持原本較短的
    prompt，不加這段，避免拖慢即時回應。
    """
    import re

    # 建立「盲測」資訊：只給座標區域，不給原有標籤，避免 AI 產生偏見。
    # 只挑 BLIND_TEST_CLASSES（Person/Machinery/Vehicle）送進去——PPE 類別
    # 信任 YOLO 自己的分類，見 BLIND_TEST_CLASSES 定義處的說明。
    # id 用「detections 清單裡的原始 index」而不是重新編號，verify_merge 那邊才能
    # 直接用同一個 index 對回 detections，不用另外維護映射表。
    yolo_regions = []
    for i, det in enumerate(detections):
        if det.class_name not in BLIND_TEST_CLASSES:
            continue
        x, y, w, h = det.bbox
        # 歸一化座標 [ymin, xmin, ymax, xmax] (0-1000)
        yolo_regions.append({
            "id": i,
            "region": [round(y/img_height * 1000), round(x/img_width * 1000),
                      round((y+h)/img_height * 1000), round((x+w)/img_width * 1000)]
        })

    print(f"DEBUG: Starting Blind-Test with {len(yolo_regions)} regions "
          f"(out of {len(detections)} total detections; PPE/其他類別不送盲測，直接信任 YOLO)")

    # 2026-09-13 新增：只有匯出 PDF 的 quality tier 才附上法規引用清單，
    # 且清單只放已查證確認過的條文（見 _build_regulation_reference_text 說明），
    # 避免模型自己編造法條號碼。
    regulation_section = ""
    if tier == "quality":
        reg_refs = _build_regulation_reference_text()
        if reg_refs:
            regulation_section = f"""
    ## 任務 3：法規引用（僅匯出報告時啟用）
    以下是系統已實際查證過、確認現行有效的正式法規條文，供你在 `recommendations`
    的建議事項中視情況引用：
    {reg_refs}

    引用規則：
    1. 只有當某條建議明確對應到上面清單裡的情境時，才在該建議文字裡完整寫出法規
       名稱與條號（例如：「依《職業安全衛生設施規則》第92條，應避免人員進入吊掛
       物下方」）。
    2. **絕對禁止**引用清單以外的任何法規名稱或條號——包含你自己知道、但清單沒有
       列出的條文。沒有把握對應到清單內容時，就只給一般性的安全建議文字，不要附
       加任何法條號碼，也不要用「相關法規」「依規定」這類含糊帶過的字眼假裝有引用。
    3. 清單是空的或找不到對應項目時，recommendations 一律不出現法規條號。
"""

    prompt = f"""
    你是一位「工地安全稽核專家」。請針對附圖進行專業的物體辨識校正與安全評估。

    【語言規則】所有輸出文字（scene_description、hazards、recommendations、rationale 等）一律使用
    「繁體中文」，並採台灣工程用語習慣。禁止出現任何簡體字。

    ## 任務 1：區域特徵視覺審計 (Visual Audit)
    影像中座標區域 [ymin, xmin, ymax, xmax] (尺度 0-1000) 如下：
    {json.dumps(yolo_regions, ensure_ascii=False)}

    請針對每一個 ID 進行「零偏見、像素級」的辨識審核：
    1. **忽視殘留標籤**：影像中可能殘留舊標籤、信心分數或導向文字，請**完全忽視**。僅依據影像原始像素判斷。
    2. **解除邊界綁定 (Untie Boundary)**：
        - 若一個區域內同時包含「人員」與「結構/機具」，請以**人類**為判別核心。
        - 如果該區域中人員明顯可見，而判定的「機具」只是背景的固定支架，請**絕對禁止**判定為 Excavator，並將該 ID 標記為 `status: "invalid"`。
    3. **人員辨識 (Person)**：觀察是否包含戴安全帽、穿反光背心或可辨識的人體形態。
    4. **結構物排除 (Structural vs. Machinery)**：
        - 腳手架 (Scaffolding)、施工鋼構框架、橋樑綠色結構、支架、固定式模板水泥柱，皆屬於「固定結構物」。
        - **絕對禁止**：嚴禁將人員正在走動、站立或扶持的「支架/結構」誤判為機具。機具必須具備獨立的機械形態（如挖掘缸、履帶、駕駛座）。
        - 若區域內僅有結構架、土石或背景，請將該 ID 標記為 `status: "invalid"`。
    - **強一致性**：如果你在後方的「安全分析」中認為某 ID 是誤判，則對應 ID 的 `verified_label` 必須同步更新為無效，不得出現描述矛盾。

    ## 任務 2：現場安全綜合分析
    - 專業描述當前施工環境、作業類型與潛在風險。
    - 提供具體的改善建議。
        - `scene_description` 必須是「高資訊密度」描述，至少涵蓋以下四個面向：
            1. 周邊環境：場域類型（如道路、橋梁、建築工地）、地面/背景狀態、可見結構物與相對位置。
            2. 主體特徵：人員數量與姿態、PPE（安全帽/反光背心）可見情況、機具外觀關鍵特徵。
            3. 畫面細節：光線、遮擋、距離遠近、視角、可能影響判斷的模糊或裁切情況。
            4. 辨識依據：明確指出你是根據哪些可見像素特徵做出判斷，避免只給結論。
        - `scene_description` 請以完整自然語句撰寫，建議 80-180 字，禁止使用過度籠統詞彙（如「有一些東西」「看起來正常」）。
        - 若畫面中資訊不足，必須明確標註「不確定性來源」與仍可確認的事實。
        - `hazards` 只列「YOLO 偵測類別涵蓋不到、需要整體畫面判讀才看得出來」的潛在危害
          （例如物料堆置不穩定、通道阻塞、開口未加蓋、照明不足、天候影響），
          **不要**重複描述安全帽／背心／口罩的配戴狀況或人員與機具/電桿的距離——
          這些已經由系統另外用固定規則計算，不需要也不應該由你重複判斷。
          如果畫面中沒有這類額外隱患，回傳空陣列即可，不要硬湊。
        - **不要**輸出 risk_level：整體風險等級改由系統依偵測到的違規項目用固定規則計算，
          不再由你判斷，請勿猜測或編造這個欄位。
    {regulation_section}
    ## 輸出格式（嚴格 JSON）：
    {{
    "scene_description": "高細節場景描述（需含周邊環境、主體特徵、畫面細節、辨識依據與必要不確定性說明）",
      "hazards": [
        {{"description": "僅限 YOLO 偵測類別之外、需整體畫面判讀的隱患", "severity": "high|medium|low"}}
      ],
      "recommendations": ["具體建議（僅在任務3清單內有對應時才附法規條號，其餘不附）"],
      "object_verification": [
        {{
          "id": 0,
          "verified_label": "Person|Excavator|Truck|Machinery|Other",
          "status": "valid|invalid",
          "rationale": "判定理由"
        }}
      ]
    }}
    """

    try:
        t0 = time.perf_counter()
        print(f"🎚️  Using model: {model_name}")
        response = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": model_name,
                "prompt": prompt,
                "images": [image_base64],
                "stream": False,
                "format": "json",
                # Phase 0 新增：常駐模型，避免閒置卸載造成的間歇性長延遲
                "keep_alive": OLLAMA_KEEP_ALIVE,
                "options": {
                    # Phase 0 新增：明確給 context 大小，避免長 prompt + 影像 token 被靜默截斷
                    "num_ctx": OLLAMA_NUM_CTX
                }
            },
            timeout=120
        )
        ollama_elapsed = time.perf_counter() - t0
        print(f"⏱️  Ollama /api/generate roundtrip: {ollama_elapsed*1000:.0f} ms")

        if not response.ok:
            raise HTTPException(status_code=500, detail=f"Ollama API error: {response.text}")

        data = response.json()
        raw_response = data.get('response', '') or data.get('thinking', '')

        # Phase 0 新增：Ollama 自己回報的 token 計數與是否命中 context 上限，
        # 對判斷「輸出被截斷」很關鍵
        if 'prompt_eval_count' in data or 'eval_count' in data:
            print(f"DEBUG: Ollama tokens — prompt_eval_count={data.get('prompt_eval_count')}, "
                  f"eval_count={data.get('eval_count')}, "
                  f"done_reason={data.get('done_reason')}")

        print(f"\n--- RAW AI RESPONSE START ---\n{raw_response}\n--- RAW AI RESPONSE END ---\n")

        # 提取 JSON
        json_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
        if json_match:
            try:
                result = json.loads(json_match.group(0))
                print(f"DEBUG: Parsed verification for {len(result.get('object_verification', []))} items")
                return result
            except Exception as parse_err:
                print(f"⚠️  JSON parse failed despite regex match: {parse_err}")
                print(f"⚠️  This usually means the model's output was truncated (see done_reason above) "
                      f"or the model doesn't actually support vision input.")

        # 注意：這裡不再回傳 risk_level——Phase 3 後 risk_level 一律由
        # compute_rule_based_hazards() 依偵測結果計算，VLM 這條路徑失敗時
        # 完全不影響風險判斷是否正確，只影響 scene_description 有沒有內容。
        return {"scene_description": "解析失敗", "hazards": [], "recommendations": [], "object_verification": []}

    except Exception as e:
        print(f"ERROR: Ollama analysis failed - {e}")
        # 返回友善的訊息而不是錯誤
        return {
            "scene_description": "⚠️ Ollama 服務未運行，無法進行 AI 場景分析。YOLO11 物件偵測與規則式風險判斷仍正常運作。",
            "hazards": [
                {"description": "Ollama 服務未啟動，建議安裝並啟動 Ollama 以獲得完整的 AI 場景描述", "severity": "low"}
            ],
            "recommendations": [
                "安裝 Ollama: https://ollama.ai/download",
                "下載模型: ollama pull qwen3-vl:8b",
                "或在沒有 Ollama 的情況下，僅使用 YOLO11 物件偵測與規則式風險判斷功能"
            ],
            "object_verification": []
        }

# ===== API 端點 =====
@app.get("/")
async def root():
    """根端點"""
    return {
        "status": "running",
        "service": "Construction Safety AI Backend",
        "yolo_model": "YOLO11 Construction Hazard Detection",
        "yolo_available": yolo_model is not None,
        "ollama_host": OLLAMA_HOST
    }

@app.get("/health")
def health_check():
    """
    健康檢查端點

    Phase 0 擴充：除了原本的 status/yolo_available/ollama_available，
    加入實際運算裝置與「設定的模型是否真的存在於 Ollama」的檢查，
    這兩項是先前完全看不到、卻直接影響效能與正確性的關鍵資訊。

    Phase 1（RC-1）：改成同步 def——裡面的 requests.get() 本來就是
    blocking call，掛在 async def 下會直接卡住事件迴圈到 timeout（最多 2 秒）。
    """
    from datetime import datetime

    # 檢查 Ollama 是否可用，並取得已安裝模型清單
    ollama_available = False
    installed_models: List[str] = []
    try:
        response = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=2)
        if response.status_code == 200:
            ollama_available = True
            installed_models = [m.get("name", "") for m in response.json().get("models", [])]
    except Exception:
        pass

    ollama_tiers = {
        tier: {"model": model, "available": model in installed_models}
        for tier, model in OLLAMA_MODELS.items()
    }
    configured_model_available = ollama_tiers[DEFAULT_TIER]["available"]

    # 檢查實際運算裝置（避免以為在用 GPU、其實在用 CPU）
    device_info = {"torch_installed": False, "cuda_available": False, "device_name": None}
    try:
        import torch
        device_info["torch_installed"] = True
        device_info["torch_version"] = torch.__version__
        device_info["cuda_available"] = torch.cuda.is_available()
        if device_info["cuda_available"]:
            device_info["device_name"] = torch.cuda.get_device_name(0)
            device_info["vram_total_gb"] = round(
                torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 1
            )
    except Exception as e:
        device_info["error"] = str(e)

    return {
        # ---- 原有欄位（前端相容）----
        "status": "healthy",
        "yolo_model": "YOLO11 Construction Hazard Detection",
        "yolo_available": yolo_model is not None,
        "ollama_available": ollama_available,
        "ollama_host": OLLAMA_HOST,
        "timestamp": datetime.now().isoformat(),
        # ---- Phase 0 新增欄位 ----
        "ollama_configured_model": OLLAMA_MODELS[DEFAULT_TIER],  # 相容舊欄位，指向 fast tier
        "ollama_configured_model_available": configured_model_available,
        "ollama_installed_models": installed_models,
        "device": device_info,
        # ---- Phase 0.5 新增：分層模型狀態 ----
        "ollama_tiers": ollama_tiers,
    }


@app.post("/api/fetch-image")
def fetch_image(request: dict):
    """
    代理下載圖片（解決 CORS 問題）

    請求格式:
    {
        "url": "https://example.com/image.jpg"
    }

    返回: Base64 編碼的圖片

    Phase 1（RC-1）：改成同步 def——內部的 requests.get() 最多可以卡到
    timeout=10 秒，掛在 async def 下這 10 秒事件迴圈整個動不了。
    """
    try:
        url = request.get("url")
        if not url:
            raise HTTPException(status_code=400, detail="Missing 'url' parameter")

        print(f"📥 Fetching image from: {url}")

        # 下載圖片
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)

        if not response.ok:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch image: {response.status_code}"
            )

        # 轉換為 base64
        image_base64 = base64.b64encode(response.content).decode('utf-8')

        print(f"✅ Image fetched: {len(response.content)} bytes")

        return {
            "success": True,
            "image_base64": f"data:image/jpeg;base64,{image_base64}",
            "size": len(response.content)
        }

    except requests.RequestException as e:
        print(f"❌ Error fetching image: {e}")
        raise HTTPException(status_code=503, detail=f"Failed to fetch image: {str(e)}")
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/detect", response_model=DetectResult)
def detect_frame(file: UploadFile = File(...)):
    """
    Phase 2 新增：只跑 YOLO，不呼叫 VLM，秒回原始（未經 AI 校核）的偵測框。

    設計脈絡：/api/analyze 單次要等 VLM 跑完（7-28 秒）才回應，Sidebar 在這之前
    完全是空的。這支端點只做 YOLO 偵測（~50-120ms），前端可以先打這支立刻把框
    畫出來，「同一張圖」再送一次 /api/analyze 取得 VLM 校核後的最終版本並直接
    替換掉畫面上的內容。

    刻意不重用 /api/analyze 裡的任何狀態、也不快取偵測結果——兩支端點各自獨立
    重跑一次 YOLO，因為 YOLO 本身很快（相對於 VLM 的 7-28 秒可忽略），這樣可以
    完全不用維護跨請求的暫存狀態，程式簡單很多，也不用擔心兩次呼叫之間狀態不同步。
    只要輸入影像位元組相同、YOLO 是 eval 模式的確定性推論，兩支端點對同一張圖
    算出來的偵測清單與順序會一致（/api/analyze 內部的 id 對應正是靠這個順序）。
    """
    image_bytes = file.file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    print("🔍 [Phase 2] Fast YOLO-only detection (raw, unverified)...")
    detections = run_yolo_detection(image.copy())

    # Phase 3：risk_level 是純規則引擎算出來的，不需要等 VLM，秒回階段就能算。
    risk = compute_rule_based_hazards(detections)

    annotated_image = draw_final_annotations(image, detections)
    buffered = io.BytesIO()
    annotated_image.save(buffered, format="JPEG", quality=90)
    annotated_image_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

    return DetectResult(
        yolo_detections=detections if detections else None,
        yolo_annotated_image=annotated_image_base64,
        hazards=risk["hazards"],
        risk_level=risk["risk_level"],
        risk_score=risk["risk_score"],
        risk_percentage=risk["risk_percentage"],
    )


@app.post("/api/analyze", response_model=IntegratedResult)
def analyze_frame(file: UploadFile = File(...), tier: str = Form(DEFAULT_TIER)):
    """
    分析工地影像

    Phase 0 擴充：在每個階段前後打點計時，並在結束時印出完整分解，
    藉此確認延遲究竟花在哪裡（讀檔／解碼／YOLO／Ollama／繪圖），
    而不是繼續憑印象猜測。

    Phase 0.5 擴充：tier 決定用哪一顆視覺語言模型 —
    "fast"（預設，網頁圖片分析／webcam 用）或 "quality"（匯出 PDF 前重新分析用）。
    未知或缺漏的 tier 一律退回 DEFAULT_TIER，不會炸掉請求。

    Phase 1（RC-1，關鍵修正）：這是全站最花時間的端點——analyze_with_ollama
    單次就要 7-15 秒，先前是 async def，代表這 7-15 秒整個事件迴圈被獨占，
    /health、其他分析請求全部卡住，前端很容易誤判成「backend 沒回應」。
    改成同步 def 後，FastAPI（實際上是 Starlette）會自動把這個函式丟進
    執行緒池執行，事件迴圈在等待期間可以繼續處理別的請求。
    代價：不能再用 `await file.read()`，改用 file.file 這個底層 SpooledTemporaryFile
    的同步 read()。
    """
    model_name = OLLAMA_MODELS.get(tier, OLLAMA_MODELS[DEFAULT_TIER])
    print(f"🎚️  Analysis tier: '{tier}' → model: {model_name}")
    t_request_start = time.perf_counter()
    timings = {}

    print(f"\n{'='*40}")
    print(f"📥 RECEIVED ANALYSIS REQUEST at {datetime.now().isoformat()}")
    try:
        # 讀取圖片（同步版本：file.file 是底層的 SpooledTemporaryFile）
        t0 = time.perf_counter()
        image_bytes = file.file.read()
        timings['1_upload_read'] = time.perf_counter() - t0
        print(f"📦 Read {len(image_bytes)} bytes from request")

        # 讀取圖片並建立絕對純淨的副本
        t0 = time.perf_counter()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = image.size
        # 建立副本用於分析，徹底杜絕任何引用污染
        pure_image = image.copy()
        timings['2_decode'] = time.perf_counter() - t0

        # 1. YOLO 偵測（原始解析度）
        print("🔍 Running YOLO11 detection...")
        t0 = time.perf_counter()
        detections = run_yolo_detection(pure_image)
        timings['3_yolo_detect'] = time.perf_counter() - t0

        # Phase 0 新增：VLM 只吃縮小後的圖，不再是原始解析度
        t0 = time.perf_counter()
        vlm_image_base64, vlm_w, vlm_h, orig_bytes, vlm_bytes = resize_for_vlm(pure_image)
        timings['4_vlm_image_resize'] = time.perf_counter() - t0
        print(f"📐 VLM image: {img_w}x{img_h} → {vlm_w}x{vlm_h}  "
              f"({orig_bytes/1024:.0f} KB → {vlm_bytes/1024:.0f} KB, quality={VLM_JPEG_QUALITY})")

        # 2. Ollama 綜合分析（用縮小後的影像；座標仍是 0-1000 正規化，不受影響）
        print(f"🤖 AI Audit on {len(detections)} detection points...")
        t0 = time.perf_counter()
        ai_analysis_raw = analyze_with_ollama(vlm_image_base64, detections, img_w, img_h, model_name, tier=tier)
        timings['5_vlm_analysis'] = time.perf_counter() - t0

        # 3. 根據 AI 校核結果更新偵測清單
        #
        # 使用者回饋（2026-09-13）：只有 BLIND_TEST_CLASSES（Person/Machinery/Vehicle）
        # 送進了 VLM 盲測，PPE 類別（Hardhat/Mask/Safety Vest 及其違規版本）跟
        # Safety Cone/Utility Pole 完全沒送進去，直接信任 YOLO 的原始判斷、不做任何
        # 校核或覆寫——避免非 Person/Machinery/Vehicle 的偵測被硬套進只涵蓋
        # Person|Excavator|Truck|Machinery|Other 的校核詞彙表，資訊被錯置。
        t0 = time.perf_counter()
        verified_detections = []
        object_verifications = ai_analysis_raw.get("object_verification", [])

        print(f"🔍 AI verification results: {len(object_verifications)} items "
              f"(僅套用於 {sum(1 for d in detections if d.class_name in BLIND_TEST_CLASSES)} 個 Person/Machinery/Vehicle 偵測)")

        for i, det in enumerate(detections):
            if det.class_name not in BLIND_TEST_CLASSES:
                # PPE / Safety Cone / Utility Pole：不經過校核，原封不動保留 YOLO 的判斷
                verified_detections.append(det)
                continue

            # 強化 ID 比對邏輯：同時支援整數與字串
            verification = next((v for v in object_verifications if str(v.get("id")) == str(i)), None)
            if verification:
                if verification.get("status") == "invalid":
                    print(f"   🗑️ AI Marking as Invalid: {det.class_name}")
                    continue

                new_label = verification.get("verified_label")
                if new_label:
                    # 使用 Single Source of Truth 獲取標準化標籤與顏色。
                    # Phase 3 防呆修正：get_label_info 對詞彙表外的未知字串
                    # （例如先前發現過的 "Structural"）現在回傳 None，代表
                    # 不是一個看得懂的標籤——這種情況下保留 YOLO 原始判斷，
                    # 不能把來路不明的字串當成校核結果套用上去。
                    label_info = get_label_info(new_label)
                    if label_info:
                        print(f"   🔧 [AI SYNC] {det.class_name} -> {label_info['name']}")
                        det.class_name = label_info["name"]
                        det.color = label_info["color"]
                    else:
                        print(f"   ⚠️ [AI SYNC IGNORED] 詞彙表外的未知標籤 '{new_label}'，"
                              f"保留原始 YOLO 判斷 '{det.class_name}'")
            # 沒有對應校核結果（例如 AI 回應解析失敗）時，保留 YOLO 原始判斷，不憑空丟棄
            verified_detections.append(det)
        timings['6_verify_merge'] = time.perf_counter() - t0

        # Phase 3：risk_level 改由規則引擎依「校核後的最終偵測清單」計算，
        # 不再由 VLM 自由判斷。VLM 的 hazards 現在只負責補充 YOLO 類別看不出來的
        # 隱患（物料堆置、通道阻塞等），标記為 informational，不影響 risk_level。
        rule_risk = compute_rule_based_hazards(verified_detections)
        narrative_hazards = [
            {
                "description": h.get("description", ""),
                "severity": h.get("severity", "low"),
                "n_code": None,
                "hazard_name": None,
                "regulation": None,
                "detected_probability": None,
                "severity_score": None,
                "risk_score": None,
                "risk_percentage": None,
                "informational": True,
                "source": "narrative",
            }
            for h in ai_analysis_raw.get("hazards", [])
            if h.get("description")
        ]

        # 將結果轉換為 AnalysisResult
        ai_analysis = AnalysisResult(
            scene_description=ai_analysis_raw.get("scene_description", "分析中..."),
            hazards=rule_risk["hazards"] + narrative_hazards,
            risk_level=rule_risk["risk_level"],
            risk_score=rule_risk["risk_score"],
            risk_percentage=rule_risk["risk_percentage"],
            recommendations=ai_analysis_raw.get("recommendations", [])
        )

        # 4. 繪製標註圖（畫在原始解析度上，跟 VLM 用的縮圖無關）
        print(f"🎨 Drawing {len(verified_detections)} verified objects...")
        t0 = time.perf_counter()
        final_annotated_image = draw_final_annotations(image, verified_detections)

        buffered_final = io.BytesIO()
        final_annotated_image.save(buffered_final, format="JPEG", quality=90)
        annotated_image_base64 = base64.b64encode(buffered_final.getvalue()).decode('utf-8')
        timings['7_draw_encode'] = time.perf_counter() - t0

        timings['total'] = time.perf_counter() - t_request_start

        print("\n⏱️  TIMING BREAKDOWN")
        print("-" * 40)
        for k, v in timings.items():
            label = k.split('_', 1)[1] if '_' in k and k[0].isdigit() else k
            print(f"   {label:20s}: {v*1000:8.1f} ms")
        print("-" * 40)

        print("✅ Integrated analysis complete!")

        return IntegratedResult(
            yolo_detections=verified_detections if verified_detections else None,
            yolo_annotated_image=annotated_image_base64,
            ai_analysis=ai_analysis
        )

    except Exception as e:
        print(f"❌ Error during analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== PDF 報告生成 API =====
class PDFRequest(BaseModel):
    """PDF 生成請求"""
    yolo_image_base64: str
    risk_level: str
    # Phase 3 新增：偵測危害機率×嚴重度算出的風險值百分比。Optional 是為了
    # 相容舊前端（萬一還沒更新就打這支 API），沒帶的話 PDF 就不顯示百分比。
    risk_percentage: Optional[int] = None
    scene_description: str
    hazards: List[dict]
    recommendations: List[str]
    detection_count: int = 0


@app.post("/api/export-pdf")
def export_pdf(request: PDFRequest):
    """
    生成工地安全分析 PDF 報告

    請求格式:
    {
        "yolo_image_base64": "...",
        "risk_level": "high/medium/low",
        "scene_description": "...",
        "hazards": [{"description": "...", "severity": "HIGH"}],
        "recommendations": ["...", "..."],
        "detection_count": 3
    }

    返回: PDF 檔案 (application/pdf)

    Phase 1（RC-1）：改成同步 def——PDF 生成（含圖片編碼排版）是 CPU-bound
    的 blocking 工作，掛在 async def 下會卡住事件迴圈；現在匯出 PDF 前又會
    先觸發一次 quality 重新分析（Phase 0.5），這段路徑上疊加的 blocking 時間
    更長，更需要挪出事件迴圈。
    """
    try:
        print("📄 Generating PDF report...")

        # 生成 PDF
        pdf_bytes = pdf_generator.generate_report(
            yolo_image_base64=request.yolo_image_base64,
            risk_level=request.risk_level,
            risk_percentage=request.risk_percentage,
            scene_description=request.scene_description,
            hazards=request.hazards,
            recommendations=request.recommendations,
            detection_count=request.detection_count
        )

        # 生成檔案名稱（格式：工地安全報告_2026-01-01_123045.pdf）
        from datetime import datetime
        from urllib.parse import quote

        filename = f"工地安全報告_{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.pdf"
        # 使用 RFC 2231 編碼支援中文檔名
        filename_encoded = quote(filename)

        print(f"✅ PDF generated: {filename} ({len(pdf_bytes)} bytes)")

        # 返回 PDF 檔案
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{filename_encoded}"
            }
        )

    except Exception as e:
        print(f"❌ Error generating PDF: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ===== 主程式 =====
if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=BACKEND_PORT,
        # Phase 0 修正（RC-2）：關閉 auto-reload。
        # 開著的話，backend/__pycache__、backend/runs/ 或任何被監看目錄下的檔案異動
        # 都會觸發整個服務重啟（重新載入 51MB 的 YOLO 權重），
        # 這是目前「服務時斷時續、卻查不到原因」的主因之一。
        # 若要在開發時修改程式碼即時生效，另外用 `uvicorn app:app --reload` 手動啟動。
        reload=False,
        log_level="info"
    )
