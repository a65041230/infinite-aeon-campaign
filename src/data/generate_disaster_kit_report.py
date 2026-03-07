import pandas as pd
import os
from openpyxl.drawing.image import Image as OpenPyXLImage
from PIL import Image as PILImage

# 報表資料定義
data = [
    {"分類": "緊急糧食飲水", "項目": "飲用水", "說明": "每人每天3公升，至少準備3日份 (9公升)。", "備註": "建議瓶裝水，避免含糖飲料。"},
    {"分類": "緊急糧食飲水", "項目": "高能量食物", "說明": "巧克力、乾糧、餅乾、罐頭等。", "備註": "需可常溫保存，不需加熱食用。"},
    {"分類": "醫療清潔用品", "項目": "個人常備藥與急救包", "說明": "內含優碘、OK繃、消毒藥水、止痛藥及慢性病藥物。", "備註": "每半年檢查效期。"},
    {"分類": "醫療清潔用品", "項目": "清潔衛生用品", "說明": "口罩、面紙、濕紙巾、酒精、生理用品。", "備註": ""},
    {"分類": "禦寒保暖衣物", "項目": "衣物與保暖", "說明": "輕便外套、內衣褲、襪子、暖暖包、雨衣。", "備註": "視季節調整，建議有手套預防碎石刺傷。"},
    {"分類": "貴重物品證件", "項目": "重要身分證件影本", "說明": "身分證、健保卡、存摺影本。", "備註": "使用防水鏈袋封好。"},
    {"分類": "其他必要工具", "項目": "照明與電力", "說明": "手電筒、電池、具收音機功能、行動電源。", "備註": "建議使用手搖或充電式。"},
    {"分類": "其他必要工具", "項目": "求生工具", "說明": "哨子、瑞士刀、工作手套、打火機、紙筆。", "備註": "哨子可提供搜救定位。"}
]

# 圖片資料路徑 (根據剛生成的檔案路徑)
img_mapping = {
    "緊急糧食飲水": r"C:\Users\a6504\.gemini\antigravity\brain\019e67f2-6ea2-43ac-8a28-dfa51ae9dcff\disaster_kit_survival_items_1772533857563.png",
    "醫療清潔用品": r"C:\Users\a6504\.gemini\antigravity\brain\019e67f2-6ea2-43ac-8a28-dfa51ae9dcff\emergency_first_aid_supplies_1772533870977.png",
    "其他必要工具": r"C:\Users\a6504\.gemini\antigravity\brain\019e67f2-6ea2-43ac-8a28-dfa51ae9dcff\emergency_lighting_power_tools_1772533890496.png"
}

df = pd.DataFrame(data)
file_path = '防災包建議清單_圖文版.xlsx'

writer = pd.ExcelWriter(file_path, engine='openpyxl')
df.to_excel(writer, sheet_name='防災包清單', index=False)
worksheet = writer.sheets['防災包清單']

# 格式設定
for col in worksheet.columns:
    max_length = 0
    column = col[0].column_letter
    for cell in col:
        try:
            if len(str(cell.value)) > max_length:
                max_length = len(str(cell.value))
        except: pass
    worksheet.column_dimensions[column].width = min(max_length + 10, 50)

# 插圖邏輯
worksheet.column_dimensions['E'].width = 40
currentRow = 2
for idx, row in df.iterrows():
    worksheet.row_dimensions[idx + 2].height = 100
    category = row['分類']
    if category in img_mapping and os.path.exists(img_mapping[category]):
        # 生成縮圖
        path = img_mapping[category]
        thumb_path = path.replace(".png", "_thumb.png")
        if not os.path.exists(thumb_path):
            img = PILImage.open(path)
            img.thumbnail((180, 180))
            img.save(thumb_path)
            
        xl_img = OpenPyXLImage(thumb_path)
        xl_img.width = 120
        xl_img.height = 120
        worksheet.add_image(xl_img, f"E{idx + 2}")

writer.close()
print(f"防災包報表已生成：{os.path.abspath(file_path)}")
