# kid-phonics

給幼兒學注音、英文字母的靜態網站（`index.html`、`app.js`、`style.css`，免建置）。資料在 `data/zhuyin.json`、`data/abc.json`，
工具腳本在 `tools/`（Python，用 `py` 執行，需要 ffmpeg）。說明見 `README.md`，進度見 `ROADMAP.md`。
`work/` 不進版控，裡面的檔案都可以重新產生。

## 聲音

- 注音符號：教育部錄音 `assets/audio/zh/sym/`。Gemini 試過念不好，不要換（見 ROADMAP 0.1）。
- 範例詞：Gemini TTS 錄音 `assets/audio/zh/word/`（`sayWord` → `wordUrl()`），播不出來才用裝置 TTS。
  產生、重念的方法見 README「錄音」。

## 改範例詞或重念時

- Gemini key 在 `.env`（git-ignore，不要 commit），model／voice 要跟 `.env.example` 一樣，才會是同一個聲音。
  免費額度每天 10 次，每跑一次 `gemini_tts.py` 算 1 次，打之前先估好要幾次。
- 念錯的詞：把提示加進 `tools/tts_hints.tsv`（`詞<TAB>拼音與說明`），只把那幾行另存成 txt，
  跑 `gemini_tts.py`、`split_tts.py`，會覆蓋同名檔。試新東西時加 `split_tts.py --out work/...`，不要寫進 `assets/`。
- **不要對舊的 `work/tts/script.txt` 重跑 `split_tts.py`**：會用舊錄音把重念過的詞蓋回去。
- 新增或改詞後：注音依教育部審訂音（README「注音校對」），加新詞要記錄是否已對照辭典。
- 每次產生後，都請使用者用 `review.html` 試聽、確認，才 commit。
- 單字詞維持單字（拼拼看、抓錯遊戲要用）；只差聲調、聽起來太像的詞（魚／雨）才改成雙字詞（雨滴），目標音放第一個字。
