# kid-phonics

給幼兒學注音的靜態網站（`index.html`、`app.js`、`style.css`，免建置）。資料在 `data/zhuyin.json`，
工具腳本在 `tools/`（Python，用 `py` 執行，需要 ffmpeg）。說明見 `README.md`，進度見 `ROADMAP.md`。
`work/` 不進版控，裡面的檔案都可以重新產生。

## 進行中：範例詞改用 Gemini TTS 錄音

**問題**：單字詞（筆、貓）播 `assets/audio/zh/syl/` 的真人錄音，多字詞（冰淇淋）用裝置語音合成，
同一頁聽起來像兩個人（見 `app.js` 的 `sayWord`）。
**做法**：用 Gemini TTS 一次念完全部 154 個詞，依停頓切成每詞一檔，`sayWord` 改成先播這些檔。

### 步驟

1. 設定 key：複製 `.env.example` 成 `.env`，填 `GEMINI_API_KEY`（`.env` 已 git-ignore，不要 commit）。
2. 產生詞表：`py tools/build_tts_script.py` → `work/tts/script.txt`（一行一詞，順序就是音檔順序）。
3. 呼叫 TTS：`py tools/gemini_tts.py work/tts/script.txt` → `work/tts/script.wav`。
4. 切音檔：`py tools/split_tts.py work/tts/script.txt` → `assets/audio/zh/word/<碼位>.mp3`（筆 = `7b46.mp3`）
   和 `work/tts/review.html`。
5. 請使用者用 `review.html` 逐一試聽，確認沒有錯位和念錯（重點詞見下方），使用者確認後才進行下一步。
6. 改 `app.js` 的 `sayWord`：所有詞（含多字詞、輕聲詞）先播 `assets/audio/zh/word/`，播放失敗才用 TTS。
   檔名規則比照 `sylUrl`，每個字的碼位用 `-` 連接。單字詞原本用的 `syl/` 錄音改不改，先問使用者。
7. 在 `README.md` 的「錄音」一節補上 `word/` 的來源（Gemini TTS、模型、voice）和重新產生的方法。

### 失敗時

- **切出來的段數不對**（split_tts 會停下來，不寫任何檔）：通常是漏念、重複，或詞中間有停頓。
  改成分批：`py tools/build_tts_script.py --parts 3`，再對 `script_1.txt`～`script_3.txt` 各跑步驟 3、4。
  只重跑出錯的那一份也可以。
- **API 錯誤**：`gemini_tts.py` 用的是 Interactions API（`POST /v1beta/interactions`），
  請求格式是依 2026-10 的 https://ai.google.dev/gemini-api/docs/speech-generation 寫的，
  **還沒實際呼叫過**。回傳 4xx、或格式跟預期不同時，先對照該文件修正。
  模型和 voice 可在 `.env` 用 `GEMINI_TTS_MODEL`、`GEMINI_TTS_VOICE` 改。
- **音檔被截斷**：不要改成 streaming，有人回報 streaming 超過約 60 秒會截斷。改用 `--parts` 分批。

### 要特別聽的詞

TTS 容易念成大陸讀音或念錯，以下依教育部審訂音（見 README「注音校對」）：

- 乳酪：「酪」念 ㄌㄨㄛˋ，不是 ㄌㄠˋ
- 背包：「背」念一聲 ㄅㄟ
- 寶寶、蠶寶寶：兩個「寶」都念三聲（ㄅㄠˇ ㄅㄠˇ）
- 喇叭：「叭」念一聲，不念輕聲
- 嘴巴、耳朵：刻意保留輕聲（˙ㄅㄚ、˙ㄉㄨㄛ）
- 葡萄：ㄆㄨˊ ㄊㄠˊ，第二字念二聲，不念輕聲

念錯的詞可以只重念那幾個：自己寫一個只有那幾行的 txt，跑步驟 3、4，會覆蓋同名檔。
