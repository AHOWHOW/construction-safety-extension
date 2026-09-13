#!/usr/bin/env python3
"""下載 Noto Sans TC 字體檔案"""

import requests
import os

# 使用 GitHub Releases 的直接下載連結
# 這些是 Noto CJK Sans 2.004 版本的檔案

fonts = {
    'NotoSansTC-Regular.otf': 'https://github.com/notofonts/noto-cjk/raw/e5a9119e22a/Sans/OTF/TraditionalChinese/NotoSansTC-Regular.otf',
    'NotoSansTC-Bold.otf': 'https://github.com/notofonts/noto-cjk/raw/e5a9119e22a/Sans/OTF/TraditionalChinese/NotoSansTC-Bold.otf'
}

fonts_dir = 'fonts'
os.makedirs(fonts_dir, exist_ok=True)

for filename, url in fonts.items():
    output_path = os.path.join(fonts_dir, filename)
    print(f'📥 Downloading {filename}...')
    print(f'   URL: {url}')

    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()

        # 檢查是否是有效的字體檔（OTF 檔案應該以 'OTTO' 或 0x00010000 開頭）
        content = response.content
        if len(content) < 1000:
            print(f'   ⚠️  File too small ({len(content)} bytes), probably not a valid font')
            print(f'   Content preview: {content[:100]}')
            continue

        # 檢查檔案頭
        if content[:4] not in [b'OTTO', b'\x00\x01\x00\x00', b'true', b'typ1']:
            print(f'   ⚠️  Invalid font header: {content[:4]}')
            print(f'   Content preview: {content[:100]}')
            continue

        with open(output_path, 'wb') as f:
            f.write(content)

        print(f'   ✅ Downloaded {len(content):,} bytes -> {output_path}')

    except Exception as e:
        print(f'   ❌ Failed: {e}')

print('\n✅ Done!')
