"""
YOLO11 Construction Hazard Detection 模型下載腳本
從 Hugging Face 下載模型檔案
"""

import os
from pathlib import Path
from huggingface_hub import hf_hub_download

# 模型資訊
REPO_ID = "yihong1120/Construction-Hazard-Detection-YOLO11"
MODEL_VARIANTS = {
    'nano': 'models/pt/best_yolo11n.pt',
    'small': 'models/pt/best_yolo11s.pt',
    'medium': 'models/pt/best_yolo11m.pt',
    'large': 'models/pt/best_yolo11l.pt',
    'extra-large': 'models/pt/best_yolo11x.pt',
}

def download_model(variant='extra-large', target_dir='models'):
    """
    下載 YOLO11 模型

    Args:
        variant: 模型變體 ('nano', 'small', 'medium', 'large', 'extra-large')
        target_dir: 目標目錄
    """
    if variant not in MODEL_VARIANTS:
        print(f"❌ Invalid variant: {variant}")
        print(f"Available variants: {', '.join(MODEL_VARIANTS.keys())}")
        return False

    # 建立目標目錄
    target_path = Path(target_dir)
    target_path.mkdir(parents=True, exist_ok=True)

    # 模型檔案資訊
    model_file = MODEL_VARIANTS[variant]
    filename = Path(model_file).name
    local_path = target_path / filename

    print("=" * 60)
    print(f"📥 Downloading YOLO11 {variant} model...")
    print(f"📦 Repository: {REPO_ID}")
    print(f"📄 File: {model_file}")
    print(f"💾 Saving to: {local_path}")
    print("=" * 60)

    try:
        # 從 Hugging Face 下載
        downloaded_path = hf_hub_download(
            repo_id=REPO_ID,
            filename=model_file,
            local_dir=target_path.parent,
            local_dir_use_symlinks=False
        )

        print(f"✅ Model downloaded successfully!")
        print(f"📍 Location: {downloaded_path}")

        # 檢查檔案大小
        file_size = os.path.getsize(downloaded_path) / (1024 * 1024)  # MB
        print(f"📊 File size: {file_size:.2f} MB")

        # 顯示使用說明
        print("\n" + "=" * 60)
        print("📝 Next Steps:")
        print("=" * 60)
        print(f"1. Update app.py to use: YOLO_MODEL_PATH = 'models/{filename}'")
        print(f"2. Start the backend: python app.py")
        print(f"3. The model will be loaded automatically")
        print("=" * 60)

        return True

    except Exception as e:
        print(f"❌ Download failed: {e}")
        print("\n💡 Troubleshooting:")
        print("1. Check your internet connection")
        print("2. Install huggingface_hub: pip install huggingface_hub")
        print("3. Try a smaller model variant (e.g., 'small')")
        return False


def list_available_models():
    """列出可用的模型變體"""
    print("\n📋 Available YOLO11 Model Variants:")
    print("=" * 60)
    for variant, path in MODEL_VARIANTS.items():
        print(f"  • {variant:12s} → {path}")
    print("=" * 60)
    print("\n💡 Usage:")
    print("  python download_model.py                    # Downloads extra-large (default)")
    print("  python download_model.py --variant small    # Downloads small variant")
    print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Download YOLO11 Construction Hazard Detection model"
    )
    parser.add_argument(
        '--variant',
        type=str,
        default='extra-large',
        choices=list(MODEL_VARIANTS.keys()),
        help='Model variant to download (default: extra-large)'
    )
    parser.add_argument(
        '--target-dir',
        type=str,
        default='models',
        help='Target directory for model files (default: models)'
    )
    parser.add_argument(
        '--list',
        action='store_true',
        help='List available model variants'
    )

    args = parser.parse_args()

    if args.list:
        list_available_models()
    else:
        success = download_model(variant=args.variant, target_dir=args.target_dir)
        if not success:
            exit(1)
