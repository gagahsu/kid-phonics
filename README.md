# kid-phonics

注音 + ABC + 50 音的兒童發音練習網站（概念參考「拼拼龍注音」，程式與素材自行製作）。

## 執行

```
py -m http.server 8901 --bind 127.0.0.1
```
開 http://127.0.0.1:8901 。不能直接雙擊 index.html（瀏覽器擋 file:// 讀 JSON）。
手機測試：改 `--bind 0.0.0.0`，手機連同一個 Wi-Fi 開 `http://<電腦IP>:8901`。

網站檔案：`index.html`、`style.css`、`app.js`（純 JS，無建置步驟），讀 `data/zhuyin.json` 與 `assets/img/`。
練習紀錄存在瀏覽器 localStorage（`kidphonics.v1`）。

## 目錄

```
data/zhuyin.json     注音符號 → 範例詞（含注音），詞 → 圖 slug
data/art.json        共用圖庫：slug → 英文繪圖描述 + 類別（決定要不要畫臉）
prompts/             build_prompts.py 產生，貼到 ChatGPT 的生圖 prompt（可隨時重產）
sheets/              網格原圖 sheet_NN.png + 對應名單 sheet_NN.names.txt（不要刪）
work/sheet_NN/       crop.py 裁切結果（可隨時重切）
assets/img/          審過的圖 <slug>.webp，網站實際使用
tools/               Python 工具（用 `py` 執行，python 不在 PATH）
```

## 圖卡製作流程

1. 產生 prompt（只會列出 `assets/img/` 還沒有的圖，編號接在現有 sheets 後面）：
   ```
   py tools/build_prompts.py
   ```
2. 開 ChatGPT **新對話**，貼上 `prompts/sheet_14.txt`，下載圖存成 `sheets/sheet_14.png`
   （**編號要跟 prompt 一樣**，名單 `sheets/sheet_14.names.txt` 已經放好了）。
   圖上若出現文字，追加：`Remove all text and letters, keep everything else identical.`
3. 裁切（名單、輸出位置自動對應）：
   ```
   py tools/crop.py sheets/sheet_14.png
   ```
   打開 `work/sheet_14/review.html`，**確認每張圖跟下面的名字對得上**
   （圖檔存錯編號時，裁切本身不會報錯，只有看名字才發現得了）。
   `_preview.png` 是深色底總覽，用來檢查毛邊。
   出現 `PROBLEM:` 代表數量／排列不對 → 重生該張。
   白色貼紙邊是程式統一重畫的（AI 畫的白邊粗細不一，會被剝掉），
   所以很淡的白色細節（例如熱茶的蒸氣）可能會一起被剝掉。
4. 發布：
   ```
   py tools/publish.py
   ```
   依編號順序發布全部 `work/sheet_*`，**編號大的蓋掉編號小的**。

### 某張圖要重畫

1. 刪掉 `assets/img/<slug>.webp`（必要時先改 `data/art.json` 的描述）
2. `py tools/build_prompts.py` → 它會排進新編號的 sheet
3. 生圖、存檔、`crop.py`、`publish.py`：新編號的版本會蓋掉舊的

例：doll 第一版（sheet_09）沒臉 → 重畫成 sheet_13，發布時 sheet_13 勝出。

## 畫臉規則（data/art.json 的 cat）

| cat | 臉 |
|---|---|
| animal, plant, vehicle, sky（太陽、月亮、雲、星星、雨） | 加豆豆眼 + 腮紅 |
| person | 本來就有臉，不另外指定 |
| food, object, body, scene（山、森林、浪、閃電） | 不加臉 |

個別圖要例外，在 art.json 該項加 `"face": true` 或 `"face": false`。

## 待校對：注音

範例詞注音由 AI 初擬，**需對照小孩使用的課本版本（康軒／翰林／南一）與教育部辭典校對**，特別是：

- 輕聲（˙）的詞：爸爸、媽媽、杯子、包子、帽子……所有「～子」詞
- 課本已改為非輕聲、但辭典可能不同的詞（目前採非輕聲）：
  葡萄 ㄆㄨˊ ㄊㄠˊ、太陽 ㄊㄞˋ ㄧㄤˊ、月亮 ㄩㄝˋ ㄌㄧㄤˋ、衣服 ㄧ ㄈㄨˊ、
  星星 ㄒㄧㄥ ㄒㄧㄥ、西瓜 ㄒㄧ ㄍㄨㄚ、風箏 ㄈㄥ ㄓㄥ

ㄦ 只有 2 個詞（耳朵、耳環），ㄖㄗㄛㄜ 各 4 個。
