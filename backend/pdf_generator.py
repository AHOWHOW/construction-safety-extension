"""
PDF 報告生成模組
使用 reportlab 生成工地安全分析 PDF 報告
"""

import io
import base64
from datetime import datetime
from typing import List, Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from PIL import Image

# A4 尺寸常數
A4_WIDTH = 210 * mm
A4_HEIGHT = 297 * mm
MARGIN = 20 * mm


class SafetyReportPDF:
    """工地安全報告 PDF 生成器"""

    def __init__(self):
        """初始化 PDF 生成器，註冊中文字體"""
        try:
            # 優先使用 Windows 系統字型（微軟正黑體）
            import os
            windows_font_dir = r'C:\Windows\Fonts'

            # 嘗試載入微軟正黑體
            msjh_path = os.path.join(windows_font_dir, 'msjh.ttc')  # Microsoft JhengHei
            msjhbd_path = os.path.join(windows_font_dir, 'msjhbd.ttc')  # Microsoft JhengHei Bold

            if os.path.exists(msjh_path) and os.path.exists(msjhbd_path):
                pdfmetrics.registerFont(TTFont('ChineseFont', msjh_path, subfontIndex=0))
                pdfmetrics.registerFont(TTFont('ChineseFont-Bold', msjhbd_path, subfontIndex=0))
                print("✓ Loaded Microsoft JhengHei fonts from system")
                self.font_available = True
            else:
                # 備用：標楷體
                kaiu_path = os.path.join(windows_font_dir, 'kaiu.ttf')  # DFKai-SB
                if os.path.exists(kaiu_path):
                    pdfmetrics.registerFont(TTFont('ChineseFont', kaiu_path))
                    pdfmetrics.registerFont(TTFont('ChineseFont-Bold', kaiu_path))
                    print("✓ Loaded DFKai-SB font from system")
                    self.font_available = True
                else:
                    raise FileNotFoundError("No Chinese fonts found in system")

        except Exception as e:
            print(f"Warning: Failed to load system fonts: {e}")
            print("PDF will use default fonts (Chinese may not display correctly)")
            self.font_available = False

    def generate_report(
        self,
        yolo_image_base64: str,
        risk_level: str,
        scene_description: str,
        hazards: List[dict],
        recommendations: List[str],
        detection_count: int = 0,
        risk_percentage: Optional[int] = None
    ) -> bytes:
        """
        生成 PDF 報告

        Args:
            yolo_image_base64: YOLO 分析圖片的 base64 字串
            risk_level: 風險等級 (high/medium/low)
            scene_description: 場景描述
            hazards: 隱患列表
            recommendations: 改善建議列表
            detection_count: 偵測到的物體數量
            risk_percentage: Phase 3 新增，偵測危害機率×嚴重度換算的風險值百分比（0~100）；
                              None 代表沒有規則命中或呼叫端未提供，PDF 就只顯示風險等級文字

        Returns:
            PDF 檔案的 bytes
        """
        # 建立 PDF buffer
        buffer = io.BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)

        # 生成時間
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 繪製第一頁
        self._draw_page(
            pdf=pdf,
            yolo_image_base64=yolo_image_base64,
            risk_level=risk_level,
            risk_percentage=risk_percentage,
            scene_description=scene_description,
            hazards=hazards,
            recommendations=recommendations,
            detection_count=detection_count,
            timestamp=timestamp,
            page_number=1
        )

        # 儲存 PDF
        pdf.save()

        # 取得 PDF bytes
        buffer.seek(0)
        return buffer.getvalue()

    def _draw_page(
        self,
        pdf: canvas.Canvas,
        yolo_image_base64: str,
        risk_level: str,
        scene_description: str,
        hazards: List[dict],
        recommendations: List[str],
        detection_count: int,
        timestamp: str,
        page_number: int,
        risk_percentage: Optional[int] = None
    ):
        """繪製 PDF 頁面"""

        # === 頁首 ===
        self._draw_header(pdf, timestamp)

        # === 標題 ===
        y_position = A4_HEIGHT - MARGIN - 10*mm
        y_position = self._draw_title(pdf, y_position)

        # === YOLO 分析圖片 ===
        y_position = self._draw_yolo_image(pdf, yolo_image_base64, y_position, detection_count)

        # === 風險等級 ===
        y_position = self._draw_risk_level(pdf, risk_level, y_position, risk_percentage)

        # === 場景描述 ===
        y_position = self._draw_section(
            pdf,
            "場景描述",
            scene_description,
            y_position
        )

        # === 識別到的隱患 ===
        y_position = self._draw_hazards_section(pdf, hazards, y_position)

        # === 改善建議 ===
        y_position = self._draw_recommendations_section(pdf, recommendations, y_position)

        # === 頁尾 ===
        self._draw_footer(pdf, page_number)

    def _draw_header(self, pdf: canvas.Canvas, timestamp: str):
        """繪製頁首（生成時間）"""
        if self.font_available:
            pdf.setFont('ChineseFont', 8)
        else:
            pdf.setFont('Helvetica', 8)

        pdf.setFillColor(colors.grey)
        pdf.drawRightString(
            A4_WIDTH - MARGIN,
            A4_HEIGHT - MARGIN + 5*mm,
            f"生成時間: {timestamp}"
        )
        pdf.setFillColor(colors.black)

    def _draw_footer(self, pdf: canvas.Canvas, page_number: int):
        """繪製頁尾（頁碼）"""
        if self.font_available:
            pdf.setFont('ChineseFont', 8)
        else:
            pdf.setFont('Helvetica', 8)

        pdf.setFillColor(colors.grey)
        pdf.drawCentredString(
            A4_WIDTH / 2,
            MARGIN - 5*mm,
            f"第 {page_number} 頁"
        )
        pdf.setFillColor(colors.black)

    def _draw_title(self, pdf: canvas.Canvas, y: float) -> float:
        """繪製報告標題（14pt 粗體）"""
        if self.font_available:
            pdf.setFont('ChineseFont-Bold', 14)
        else:
            pdf.setFont('Helvetica-Bold', 14)

        title = "工地安全分析報告"
        pdf.drawCentredString(A4_WIDTH / 2, y, title)

        # 繪製分隔線
        y -= 5*mm
        pdf.setStrokeColor(colors.grey)
        pdf.setLineWidth(0.5)
        pdf.line(MARGIN, y, A4_WIDTH - MARGIN, y)

        return y - 5*mm

    def _draw_yolo_image(
        self,
        pdf: canvas.Canvas,
        image_base64: str,
        y: float,
        detection_count: int
    ) -> float:
        """繪製 YOLO 分析圖片"""
        try:
            # 解碼 base64 圖片
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data))

            # 計算圖片尺寸（保持比例，最大寬度 150mm）
            max_width = 150 * mm
            max_height = 100 * mm

            img_width, img_height = image.size
            aspect_ratio = img_width / img_height

            if aspect_ratio > max_width / max_height:
                # 寬度較大，以寬度為準
                display_width = max_width
                display_height = max_width / aspect_ratio
            else:
                # 高度較大，以高度為準
                display_height = max_height
                display_width = max_height * aspect_ratio

            # 計算置中位置
            x = (A4_WIDTH - display_width) / 2
            y -= display_height

            # 繪製圖片
            img_reader = ImageReader(io.BytesIO(image_data))
            pdf.drawImage(img_reader, x, y, width=display_width, height=display_height)

            # 繪製圖片說明
            y -= 5*mm
            if self.font_available:
                pdf.setFont('ChineseFont', 9)
            else:
                pdf.setFont('Helvetica', 9)
            pdf.setFillColor(colors.grey)
            pdf.drawCentredString(
                A4_WIDTH / 2,
                y,
                f"YOLO 物體偵測 - 偵測到 {detection_count} 個物體"
            )
            pdf.setFillColor(colors.black)

            return y - 8*mm

        except Exception as e:
            print(f"Error drawing YOLO image: {e}")
            # 如果圖片繪製失敗，顯示錯誤訊息
            if self.font_available:
                pdf.setFont('ChineseFont', 10)
            else:
                pdf.setFont('Helvetica', 10)
            pdf.setFillColor(colors.red)
            y -= 10*mm
            pdf.drawCentredString(A4_WIDTH / 2, y, "[圖片載入失敗]")
            pdf.setFillColor(colors.black)
            return y - 8*mm

    def _draw_risk_level(
        self, pdf: canvas.Canvas, risk_level: str, y: float, risk_percentage: Optional[int] = None
    ) -> float:
        """繪製風險等級（Phase 3：附上偵測危害機率×嚴重度換算的風險值百分比）"""
        # 標題（12pt 粗體）
        if self.font_available:
            pdf.setFont('ChineseFont-Bold', 12)
        else:
            pdf.setFont('Helvetica-Bold', 12)

        pdf.drawString(MARGIN, y, "風險等級")
        y -= 6*mm

        # 風險等級內容（10pt，加上顏色）
        if self.font_available:
            pdf.setFont('ChineseFont', 10)
        else:
            pdf.setFont('Helvetica', 10)

        # 設定顏色
        if risk_level.lower() == 'high':
            pdf.setFillColor(colors.red)
            risk_text = "⚠ 高風險 (HIGH RISK)"
        elif risk_level.lower() == 'medium':
            pdf.setFillColor(colors.orange)
            risk_text = "⚠ 中風險 (MEDIUM RISK)"
        else:
            pdf.setFillColor(colors.green)
            risk_text = "✓ 低風險 (LOW RISK)"

        if risk_percentage is not None:
            risk_text += f"　偵測危害指數 {risk_percentage}%"

        pdf.drawString(MARGIN + 5*mm, y, risk_text)
        pdf.setFillColor(colors.black)

        return y - 8*mm

    def _draw_section(
        self,
        pdf: canvas.Canvas,
        title: str,
        content: str,
        y: float
    ) -> float:
        """繪製一般區塊（標題 + 內容）"""
        # 標題（12pt 粗體）
        if self.font_available:
            pdf.setFont('ChineseFont-Bold', 12)
        else:
            pdf.setFont('Helvetica-Bold', 12)

        pdf.drawString(MARGIN, y, title)
        y -= 6*mm

        # 內容（10pt）
        if self.font_available:
            pdf.setFont('ChineseFont', 10)
        else:
            pdf.setFont('Helvetica', 10)

        # 自動換行
        # 計算文字可用寬度：頁面寬度 - 左邊距 - 文字起始位置偏移 - 右邊距
        text_start_x = MARGIN + 5*mm
        max_width = A4_WIDTH - text_start_x - MARGIN
        lines = self._wrap_text(pdf, content, max_width)

        for line in lines:
            pdf.drawString(text_start_x, y, line)
            y -= 5*mm

        return y - 3*mm

    def _draw_hazards_section(self, pdf: canvas.Canvas, hazards: List[dict], y: float) -> float:
        """繪製隱患區塊"""
        # 標題
        if self.font_available:
            pdf.setFont('ChineseFont-Bold', 12)
        else:
            pdf.setFont('Helvetica-Bold', 12)

        pdf.drawString(MARGIN, y, "識別到的隱患")
        y -= 6*mm

        # 隱患列表
        if self.font_available:
            pdf.setFont('ChineseFont', 10)
        else:
            pdf.setFont('Helvetica', 10)

        for hazard in hazards:
            description = hazard.get('description', '')
            severity = hazard.get('severity', 'MEDIUM').upper()

            # 設定嚴重度顏色
            if severity == 'HIGH':
                severity_color = colors.red
            elif severity == 'MEDIUM':
                severity_color = colors.orange
            else:
                severity_color = colors.blue

            # 繪製項目符號
            pdf.setFillColor(severity_color)
            pdf.circle(MARGIN + 7*mm, y + 1*mm, 1*mm, fill=1)

            # 繪製描述
            pdf.setFillColor(colors.black)
            # 計算文字可用寬度：頁面寬度 - 左邊距 - 文字起始位置偏移 - 右邊距
            text_start_x = MARGIN + 10*mm
            max_width = A4_WIDTH - text_start_x - MARGIN

            # Phase 3：規則引擎算出來的隱患會附帶 n_code／風險值百分比，
            # 標記出處讓報告可稽核（哪些是固定規則算的、哪些是 AI 敘述補充的）。
            suffix = f" [{severity}]"
            if hazard.get('n_code'):
                suffix += f" [{hazard['n_code']}]"
            if hazard.get('risk_percentage') is not None:
                suffix += f" [偵測危害指數 {hazard['risk_percentage']}%]"
            elif hazard.get('source') == 'narrative':
                suffix += " [AI 場景補充，非固定規則]"

            lines = self._wrap_text(pdf, f"{description}{suffix}", max_width)

            for line in lines:
                pdf.drawString(text_start_x, y, line)
                y -= 5*mm

        return y - 3*mm

    def _draw_recommendations_section(
        self,
        pdf: canvas.Canvas,
        recommendations: List[str],
        y: float
    ) -> float:
        """繪製改善建議區塊"""
        # 標題
        if self.font_available:
            pdf.setFont('ChineseFont-Bold', 12)
        else:
            pdf.setFont('Helvetica-Bold', 12)

        pdf.drawString(MARGIN, y, "改善建議")
        y -= 6*mm

        # 建議列表
        if self.font_available:
            pdf.setFont('ChineseFont', 10)
        else:
            pdf.setFont('Helvetica', 10)

        for idx, recommendation in enumerate(recommendations, 1):
            # 繪製編號
            pdf.drawString(MARGIN + 5*mm, y, f"{idx}.")

            # 繪製內容
            # 計算文字可用寬度：頁面寬度 - 左邊距 - 文字起始位置偏移 - 右邊距
            text_start_x = MARGIN + 10*mm
            max_width = A4_WIDTH - text_start_x - MARGIN
            lines = self._wrap_text(pdf, recommendation, max_width)

            for line in lines:
                pdf.drawString(text_start_x, y, line)
                y -= 5*mm

        return y - 3*mm

    def _wrap_text(self, pdf: canvas.Canvas, text: str, max_width: float) -> List[str]:
        """自動換行文字（支援中文）"""
        lines = []
        current_line = ""

        # 逐字元檢查，以支援中文文字（中文沒有空格）
        for char in text:
            test_line = current_line + char

            # 檢查當前字串寬度
            if pdf.stringWidth(test_line) <= max_width:
                current_line = test_line
            else:
                # 超出寬度，換行
                if current_line:
                    lines.append(current_line)
                current_line = char

        # 加入最後一行
        if current_line:
            lines.append(current_line)

        return lines if lines else [text]


# 建立全域 PDF 生成器實例
pdf_generator = SafetyReportPDF()
