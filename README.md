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

## 錄音

`assets/audio/zh/sym/<碼位>.mp3`（ㄅ = `3105.mp3`）：37 個注音符號的真人錄音，
來源教育部《國語注音符號手冊》數位版開放部件，**CC BY 4.0**（姓名標示：2017 © 教育部，國語注音符號手冊-開放部件）。
網站的家長設定頁有出處說明，改動時請保留。

重新產生（需要 ffmpeg）：到[手冊首頁](https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/index.html)
下載 `bopomofo_materials_20170213.zip`，然後

```
py tools/import_moe_audio.py 路徑/bopomofo_materials_20170213.zip
```

錄音播不出來時，網站自動改用裝置語音念 `zhuyin.json` 的 `say` 代表字。

`assets/audio/zh/syl/<各字碼位以 - 連接>.mp3`（ㄇㄠ = `3107-3120.mp3`）：範例詞用到的單音節（輕聲除外），
來源 [hugolpz/audio-cmn](https://github.com/hugolpz/audio-cmn)（錄音者 Chen Wang，README 標示 CC BY-SA，版本未載明）。
目前用在單字詞（貓、馬…），多字詞仍用裝置語音。**改了 `zhuyin.json` 的注音後要重跑**，補上新音節：

```
py tools/import_syllables.py
```

## 注音校對

範例詞注音由 AI 初擬，2026-10-14 已逐詞比對教育部《國語辭典簡編本》（中小學用；資料 `dict_concised_2014_20260929`，
[公眾授權網](https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html)）。
康軒／翰林／南一都是教育部審定本，注音依教育部審訂音，三家差異主要在教學順序與呈現，讀音不會各自不同。

**結果：154 詞中 142 詞與辭典正讀一致**（含所有「～子」、爸爸媽媽等疊字輕聲，以及葡萄、太陽、月亮、衣服、星星、西瓜、風箏）。

2026-10-14 已依辭典修正：

| 詞 | 原本 | 改成 |
|---|---|---|
| 乳酪 | ㄖㄨˇ ㄌㄠˋ | ㄖㄨˇ ㄌㄨㄛˋ（臺灣審訂音「酪」念 ㄌㄨㄛˋ） |
| 喇叭 | ㄌㄚˇ ˙ㄅㄚ | ㄌㄚˇ ㄅㄚ |
| 背包 | ㄅㄟˋ ㄅㄠ | ㄅㄟ ㄅㄠ（「背」一聲，背東西） |
| 寶寶 | ㄅㄠˇ ˙ㄅㄠ | ㄅㄠˇ ㄅㄠˇ |
| 蠶寶寶 | ㄘㄢˊ ㄅㄠˇ ˙ㄅㄠ | ㄘㄢˊ ㄅㄠˇ ㄅㄠˇ（比照寶寶） |

刻意保留口語讀法（辭典列為「變」讀，正讀不標輕聲）：嘴巴 ㄗㄨㄟˇ ˙ㄅㄚ（正讀 ㄗㄨㄟˇ ㄅㄚ）、耳朵 ㄦˇ ˙ㄉㄨㄛ（正讀 ㄦˇ ㄉㄨㄛˇ）。
葡萄用正讀 ㄆㄨˊ ㄊㄠˊ（辭典另列變讀 ㄆㄨˊ ˙ㄊㄠ）。

簡編本沒有收、未經辭典佐證的詞：鍋子、粽子、孔雀、珍珠奶茶、菠蘿麵包。

ㄦ 只有 2 個詞（耳朵、耳環），ㄖㄗㄛㄜ 各 4 個。
