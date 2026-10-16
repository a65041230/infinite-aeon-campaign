# video-edit:卡點 + 摳圖轉場剪輯工具

把一堆素材(影片/照片)配一首音樂,自動剪成 9:16 直式卡點影片:
每個切點都落在拍子上,大段落(小節第一拍)用「摳圖彈出」轉場,其他拍點用 punch zoom / 閃白 / 甩鏡 / 硬切,並可上中文字幕。

## 安裝

```bash
python3 -m venv ~/vedit-venv
~/vedit-venv/bin/pip install -r video-edit/requirements.txt
# 需要系統已有 ffmpeg;第一次摳圖會從 rembg 官方 GitHub release 下載 u2net 模型(~170MB)
```

## 流程

```bash
cd video-edit
P=projects/my-reel            # 放素材的工作資料夾(已在 .gitignore)
# 1. 素材放 $P/materials/,音樂放 $P/music.mp3
# 2. 產生草稿剪輯表(自動抓拍點、分配鏡頭與轉場)
~/vedit-venv/bin/python autoplan.py $P/materials $P/music.mp3 -o $P/plan.json --seconds 15
# 3. 手動或請 Claude 調整 plan.json(入點、轉場、字幕)
# 4. 先出低解析預覽,再出成品
~/vedit-venv/bin/python render.py $P/plan.json --preview
~/vedit-venv/bin/python render.py $P/plan.json
```

## plan.json

```jsonc
{
  "music": "music.mp3", "music_start": 12.3,   // 從副歌開始用
  "beats": "beats.json",                        // autoplan 產生;刪掉則即時分析
  "fps": 30, "size": [1080, 1920], "output": "out.mp4",
  "cutout_model": "u2net",                      // 人像可用 u2net_human_seg
  "shots": [
    { "src": "materials/a.mp4", "in": 1.2, "beats": 2, "transition": "cut" },
    { "src": "materials/b.mp4", "in": 0.0, "beats": 2, "transition": "cutout" },
    { "src": "materials/c.jpg",            "beats": 4, "transition": "zoom", "pulse": true },
    { "src": "materials/d.mp4", "in": 3.0, "beats": 1, "transition": "flash", "speed": 1.5,
      "anchor": [0.5, 0.3] }
  ],
  "captions": [
    { "text": "第一句", "shot": 0 },
    { "text": "兩行\n字幕", "start_beat": 4, "beats": 2, "y": 0.8 }
  ]
}
```

| 欄位 | 說明 |
|---|---|
| `beats` | 這個鏡頭佔幾拍。快節奏 1 拍、一般 2 拍、重點鏡頭 4 拍 |
| `transition` | 進入這個鏡頭的方式:`cut` / `zoom` / `flash` / `whip` / `cutout` |
| `in` / `speed` | 素材入點(秒)與播放速度 |
| `pulse` | 鏡頭內每一拍做一次輕微縮放彈跳 |
| `push` | 整個鏡頭緩慢推近(照片預設開) |
| `anchor` | 直式裁切的焦點 `[x, y]`,0–1 |

## 摳圖轉場原理

1. 取下一個鏡頭的第一格畫面,用 rembg 摳出主體,加白色描邊與陰影做成「貼紙」。
2. 在上一個鏡頭結束前半拍,上一鏡變暗,貼紙從 135% 彈性縮回 100%。
3. 到拍點時切到下一鏡;因為貼紙就是下一鏡第一格的主體、位置相同,背景「長出來」看起來是無縫的。

主體越清楚(人物、商品、單一物件、背景乾淨),摳圖越乾淨。

## 用 AI 補畫面

素材不夠或需要補故事時,用 Higgsfield(MCP 或網頁)以便宜模型生成 3–5 秒 9:16 片段,存進 `materials/` 再跑 autoplan。
銜接兩個鏡頭時,可以把 A 鏡最後一格、B 鏡第一格當首尾幀做圖生影片,生成的片段放在兩者之間。
