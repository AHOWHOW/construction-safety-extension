"""
Phase 0 診斷腳本

用法（在 backend 目錄下）：
    python diagnose.py

會依序檢查：
1. PyTorch / CUDA 是否可用、實際抓到的 GPU
2. Ollama 是否運行中、已安裝哪些模型、設定的 qwen3-vl:8b 是否真的存在
3. Backend /health 端點目前回報的內容（含 Phase 0 新增的裝置與模型檢查欄位）

這支腳本本身不會啟動或修改任何服務，純讀取。
"""
import json
import sys


def section(title: str):
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)


def check_torch():
    section("[1/3] PyTorch / CUDA")
    try:
        import torch
        print(f"  torch 版本      : {torch.__version__}")
        cuda_ok = torch.cuda.is_available()
        print(f"  CUDA 可用       : {cuda_ok}")
        if cuda_ok:
            name = torch.cuda.get_device_name(0)
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            print(f"  GPU 裝置        : {name}")
            print(f"  VRAM            : {vram_gb:.1f} GB")
            print("  [OK] YOLO 與後續的 ONNX Runtime 都可以吃到 GPU 加速")
        else:
            print("  [X] CUDA 不可用 — 目前 YOLO 推論很可能是在用 CPU 跑，會慢非常多")
            print("      若你確定裝了 NVIDIA GPU，通常是 torch 裝到 CPU-only 版本，")
            print("      需要重裝對應 CUDA 版本的 torch。")
    except ImportError:
        print("  [X] 找不到 torch — 這台環境還沒裝後端依賴")
        print("      cd backend && pip install -r requirements.txt")


def check_ollama():
    section("[2/3] Ollama 服務與模型")
    try:
        import requests
    except ImportError:
        print("  [X] 找不到 requests 套件，無法檢查")
        return

    # Phase 0.5：分層模型，跟 app.py 的 OLLAMA_MODELS 保持一致
    target_models = {
        "fast（網頁分析／webcam）": "qwen3-vl:4b",
        "quality（匯出 PDF 重新分析）": "qwen3-vl:8b",
    }

    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=3)
        r.raise_for_status()
        models = [m.get("name", "") for m in r.json().get("models", [])]
        print(f"  Ollama 狀態     : 運行中")
        print(f"  已安裝模型      : {models if models else '（無）'}")

        for label, target_model in target_models.items():
            if target_model in models:
                print(f"  [OK] {label} 模型 '{target_model}' 存在")
            else:
                print(f"  [X] {label} 模型 '{target_model}' 不在已安裝清單中！")
                close = [m for m in models if "qwen" in m.lower()]
                if close:
                    print(f"      找到類似名稱的模型，確認是不是打錯了: {close}")
    except Exception as e:
        print(f"  [X] 無法連線到 Ollama (http://localhost:11434): {e}")
        print("      請確認 Ollama 是否已啟動 (ollama serve 或桌面程式)")


def check_backend():
    section("[3/3] Backend /health")
    try:
        import requests
    except ImportError:
        print("  [X] 找不到 requests 套件，無法檢查")
        return

    backend_url = "http://localhost:8877/health"
    try:
        r = requests.get(backend_url, timeout=5)
        r.raise_for_status()
        data = r.json()
        print(json.dumps(data, indent=2, ensure_ascii=False))

        # Phase 0 新增：驗證回應真的是我們的後端，不是 port 被別的服務佔走。
        # (診斷時真的抓到一支叫 "edse"/"workbench" 的無關服務回應在 8000 上)
        if "yolo_model" not in data or data.get("service") not in (None, "Construction Safety AI Backend"):
            print("\n  [X] 這個回應的格式不像 Construction Safety 後端！")
            print(f"      收到的欄位: {list(data.keys())}")
            print(f"      這代表 {backend_url} 這個 port 被別的服務佔用/接管了，")
            print("      不是後端沒起來，是起來了但你打到別台。")
            print("      請檢查是否有其他程式綁在這個 port 上，")
            print("      或者這支 backend 啟動時有沒有印出 'Address already in use'。")
            return

        print()
        if not data.get("yolo_available"):
            print("  [X] yolo_available = false — YOLO 模型沒載入成功，請看 backend 視窗的啟動 log")
        tiers = data.get("ollama_tiers", {})
        for tier, info in tiers.items():
            mark = "[OK]" if info.get("available") else "[X]"
            print(f"  {mark} tier '{tier}' → {info.get('model')}: available={info.get('available')}")
        device = data.get("device", {})
        if device.get("cuda_available") is False:
            print("  [X] device.cuda_available = false — backend 這邊也確認是用 CPU 在跑")
        elif device.get("cuda_available"):
            print(f"  [OK] backend 正在用 {device.get('device_name')} 做推論")
    except Exception as e:
        print(f"  [X] 無法連線到 Backend ({backend_url}): {e}")
        print("      請確認後端服務是否已啟動 (start-backend-persistent.bat 或 python app.py)")
        print("      並且是用這次更新過的 app.py（新版已改用 port 8877，不再是 8000）")


if __name__ == "__main__":
    print("Phase 0 診斷 — Construction Safety AI Backend")
    check_torch()
    check_ollama()
    check_backend()
    print("\n完成。請把上面完整輸出貼回去給 Claude。")
