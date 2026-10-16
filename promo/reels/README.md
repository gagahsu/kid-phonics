# 推廣短影音（Remotion）

三支 9:16 短影音，發布方式和貼文見 `posts/README.md`。

```
npm install
npm run studio                 # 預覽、調整
npm run render                 # out/reel-9x16.mp4   總覽
npm run render2                # out/reel2-9x16.mp4  胖胖
npm run render3                # out/reel3-9x16.mp4  安心
npm run qr                     # QR code（一般版、胖胖＆菲菲版）
```

- 畫面：`src/Reel.tsx`（第 1 支，共用元件也在這裡）、`src/Reel2.tsx`、`src/Reel3.tsx`；網址在 `src/Root.tsx`。
- 截圖：`public/img/`，用示範資料（localStorage `kidphonics.v1`）在 430×932 @3x 拍的網站畫面。
- 旁白：Gemini TTS（`scripts/promo*_tts.py`，用專案根目錄 `.env` 的 key，每跑一次算 1 次額度），
  輸出到 `work/reels/`，切好、試聽過再放進 `public/audio/`。胖胖、菲菲的台詞直接用網站的錄音。
- 背景音樂：`scripts/bgm.py` 程式合成（numpy），沒有授權問題。
- 教育部注音錄音（CC BY 4.0）：發布時要附「2017 © 教育部，國語注音符號手冊-開放部件」。
- `out/` 不進版控。
