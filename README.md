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
syllable.js          注音音節解析 {聲母, 介音, 韻母, 聲調}；改過要跑 `node tools/test_syllable.mjs`（會檢查 zhuyin.json 每個音節）
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

`assets/audio/zh/word/<各字碼位以 - 連接>.mp3`（筆 = `7b46.mp3`、冰淇淋 = `51b0-6dc7-6dcb.mp3`）：
全部 154 個範例詞（含單字詞、輕聲詞），用 Google Gemini TTS 產生（2026-10-15；模型 `gemini-3.8-flash-tts`，
voice `Lora`，台灣國語、慢速的 style 提示見 `tools/gemini_tts.py`），整頁同一個聲音。播不出來時改用裝置語音念該詞。

重新產生（需要 ffmpeg 和 Gemini API key；一次全部約 6 分鐘音訊、1 次 API 呼叫）：

```
copy .env.example .env          （填 GEMINI_API_KEY；model、voice 保持一致才會跟現有檔案同一個聲音）
py tools/build_tts_script.py    （→ work/tts/script.txt）
py tools/gemini_tts.py work/tts/script.txt
py tools/split_tts.py work/tts/script.txt   （→ word/*.mp3 和 work/tts/review.html）
```

- **一定要用 `review.html` 逐一試聽**：同一個詞每次念的不一定一樣，常見錯誤是念成大陸讀音、單字詞聲調錯（雨→魚）。
- 念錯的詞寫進 `tools/tts_hints.tsv`（`詞<TAB>拼音與說明`，只放進 style 提示、不會被念出來），
  再把那幾行另存一份 txt 跑 `gemini_tts.py`、`split_tts.py`，只會覆蓋那幾個檔。之後全部重產也會自動帶上提示。
- 段數切不對時 `split_tts.py` 會停下來、不寫檔，改用 `build_tts_script.py --parts 3` 分批。

`assets/audio/zh/pang/`、`assets/audio/zh/fei/`：胖胖、菲菲的台詞（Gemini TTS，2026-10-15；胖胖 voice `Puck`、
菲菲 voice `Tari`，角色 style 見 `tools/gemini_tts.py` 的 `STYLES`）。檔名是台詞**去掉標點**後的碼位（嗨！我是胖胖。= `55e8-6211-662f-80d6-80d6.mp3`）。
台詞清單在 `tools/cat_pang.txt`、`tools/cat_fei.txt`，必須跟 `app.js` 裡 `{ t: '…', ...PANG }`／`...FEI` 的句子一致；
沒有錄音的句子會用裝置語音念，瀏覽器 console 會出現 `no recording for`。
台詞不能帶變動的數字或詞：要嘛改成固定句（數字留在畫面上），要嘛拆成固定片段＋符號／詞錄音（「先認識」＋ㄅ＋「還有」＋ㄆ）。

新增或改台詞（各 1 次 API 呼叫；只放要重念的幾行也可以）：

```
copy tools\cat_fei.txt work\tts\
py tools/gemini_tts.py work/tts/cat_fei.txt --style fei --voice Tari
py tools/split_tts.py work/tts/cat_fei.txt --out assets/audio/zh/fei
```

- 胖胖用 `--style pang --voice Puck`、輸出 `assets/audio/zh/pang`。
- 一個字的台詞（胖！、菲。）Gemini 容易念兩次，句中的逗號也可能被切成兩段，段數剛好對上時 `split_tts.py` 不會發現。
  每句的秒數要對照字數看，對不上就要手動切。

`assets/audio/zh/pang-word/`：抓錯遊戲裡胖胖念的 33 個一字詞（Gemini TTS，2026-10-15，voice `Puck`、style `pang`，
每個詞附拼音聲調提示）。檔名規則同 `word/`；缺檔時改播 `word/` 的錄音。

`assets/audio/zh/syl/<各字碼位以 - 連接>.mp3`（ㄇㄠ = `3107-3120.mp3`）：範例詞用到的單音節（輕聲除外），
來源 [hugolpz/audio-cmn](https://github.com/hugolpz/audio-cmn)（錄音者 Chen Wang，README 標示 CC BY-SA，版本未載明）。
**目前沒有程式播放**（範例詞改用 `word/`），保留給 P2 拼拼看、抓錯遊戲評估（見 ROADMAP 0.1）。重新下載：

```
py tools/import_syllables.py
```

## 注音校對

範例詞注音由 AI 初擬，2026-10-14 已逐詞比對教育部《國語辭典簡編本》（中小學用；資料 `dict_concised_2014_20260929`，
[公眾授權網](https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html)）。
康軒／翰林／南一都是教育部審定本，注音依教育部審訂音，三家差異主要在教學順序與呈現，讀音不會各自不同。

**結果：154 詞中 142 詞與辭典正讀一致**（含所有「～子」、爸爸媽媽等疊字輕聲，以及葡萄、太陽、月亮、衣服、星星、西瓜、風箏）。

2026-10-15：ㄩ 的「雨」改成「雨滴」ㄩˇ ㄉㄧ（「雨」和「魚」只差聲調，詞卡上聽起來太像），**尚未對照辭典**。

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
