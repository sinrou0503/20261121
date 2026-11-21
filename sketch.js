let idleSheet; // 儲存角色待機動畫精靈圖
let runSheet; // 儲存角色跑步動畫精靈圖
let backgroundImage; // 儲存背景圖片
let effect1Sheet; // 儲存閃電特效精靈圖（特效/特效合併.png）
let effect2Sheet; // 儲存爆破特效精靈圖（特效二/特效二合併.png）
let effect1Loaded = false; // 記錄閃電特效是否成功載入
let effect2Loaded = false; // 記錄爆破特效是否成功載入
let idleFramesBox = []; // 儲存待機精靈圖自動切分出的每一個完整角色影格區間
let runFramesBox = []; // 儲存跑步精靈圖自動切分出的每一個完整角色影格區間
let backgroundOffset = 0; // 儲存中間主背景圖左上角的水平座標
let backgroundTileWidth = 0; // 儲存依照畫布高度等比例縮放後的單張背景寬度
let direction = 0; // 儲存移動方向，1代表向右，-1代表向左，0代表待機
let characterX = 0; // 儲存角色中心在畫面上的水平位置
let activeKeyCode = 0; // 儲存目前按住的方向鍵代碼
let runStartedAt = 0; // 儲存本次跑步動畫開始的時間
let rightBgStopped = false; // 記錄右邊複製的背景圖是否已停止移動
let effectCycleActive = false; // 記錄特效循環目前是否正在執行
let effectCycleStartedAt = 0; // 記錄目前一輪「閃電3次 + 爆破1次」開始的時間戳記（毫秒）
let effectAnchorOffsetFromBg = 0; // 記錄特效錨點相對於 backgroundOffset 的水平偏移量，隨背景轉動更新畫面位置
let lastPlayedSoundKey = ''; // 記錄上一次已播放音效的階段鍵值，避免同一階段每影格重複發聲
let audioCtx = null; // 儲存 Web Audio API 音效上下文實例
const runSequenceCount = 9; // 設定跑步開場播放的影格數
const frameDuration = 110; // 設定角色每張動畫影格的播放時間（毫秒）
const backgroundSpeed = 220; // 設定背景與角色移動速度（像素／秒）
const characterScale = 2; // 設定角色與特效顯示大小倍率
const effect1Frames = 14; // 設定閃電特效共有14張圖
const effect1FrameH = 368; // 設定閃電特效單格高度為368
const effect1CycleMs = 1000; // 設定每次閃電播放時間為1秒（1000毫秒）
const effect1RepeatCount = 3; // 設定每次循環先播放閃電3次
const effect2Frames = 10; // 設定爆破特效共有10張圖
const effect2FrameH = 168; // 設定爆破特效單格高度為168
const effect2CycleMs = 1000; // 設定爆破特效播放時間為1秒（1000毫秒）

function ensureAudioContext() { // 建立並喚醒 Web Audio API 音訊環境
  const AudioContextClass = window.AudioContext || window.webkitAudioContext; // 取得瀏覽器支援的 AudioContext 建構子
  if (!AudioContextClass) return null; // 若瀏覽器不支援 Web Audio API 則回傳 null
  if (!audioCtx) { // 若尚未建立音訊上下文
    audioCtx = new AudioContextClass(); // 建立新的 AudioContext 實例
  } // 結束建立判斷
  if (audioCtx.state === 'suspended') { // 若音訊處於暫停狀態（通常需使用者互動解鎖）
    audioCtx.resume(); // 喚醒音訊上下文以允許播放合成音效
  } // 結束暫停喚醒判斷
  return audioCtx; // 回傳可用的 AudioContext
} // 結束音訊上下文初始化函式

function createNoiseBuffer(ctx, durationSec) { // 建立白噪音緩衝區供打雷與爆破音效使用
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * durationSec)); // 依取樣率與秒數計算樣本總數
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate); // 建立單聲道音訊緩衝區
  const data = buffer.getChannelData(0); // 取得聲道資料陣列
  for (let i = 0; i < sampleCount; i += 1) { // 逐一填入隨機噪音樣本
    data[i] = Math.random() * 2 - 1; // 產生 -1 到 1 之間的隨機噪音值
  } // 結束噪音填充迴圈
  return buffer; // 回傳噪音緩衝區
} // 結束噪音緩衝區建立函式

function playThunderSound() { // 以程式合成打雷音效（低頻雷鳴 + 電擊噪音包絡）
  const ctx = ensureAudioContext(); // 取得並確保音訊上下文已啟動
  if (!ctx) return; // 若無法取得音訊上下文則略過
  const now = ctx.currentTime; // 取得目前精準音訊時間（秒）
  const thunderDuration = 0.85; // 設定單次打雷音效長度為 0.85 秒
  const noiseSource = ctx.createBufferSource(); // 建立噪音音源節點
  noiseSource.buffer = createNoiseBuffer(ctx, thunderDuration); // 套用白噪音緩衝區
  const filter = ctx.createBiquadFilter(); // 建立低通濾波器塑造雷聲悶響與電擊感
  filter.type = 'lowpass'; // 設定為低通濾波器
  filter.frequency.setValueAtTime(1400, now); // 起始保留較多高頻電擊感
  filter.frequency.exponentialRampToValueAtTime(160, now + thunderDuration); // 隨時間滑向低頻雷鳴
  const noiseGain = ctx.createGain(); // 建立噪音音量控制節點
  noiseGain.gain.setValueAtTime(0.001, now); // 避免起始爆音，先設為極小值
  noiseGain.gain.linearRampToValueAtTime(0.32, now + 0.04); // 快速拉高打雷衝擊音量
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + thunderDuration); // 平滑淡出雷聲尾韻
  noiseSource.connect(filter); // 將噪音接至濾波器
  filter.connect(noiseGain); // 將濾波後訊號接至音量節點
  noiseGain.connect(ctx.destination); // 輸出至喇叭
  noiseSource.start(now); // 立即開始播放噪音
  noiseSource.stop(now + thunderDuration); // 到時間自動停止噪音節點
  const subOsc = ctx.createOscillator(); // 建立低頻震盪器強化雷聲沉悶感
  subOsc.type = 'sawtooth'; // 使用鋸齒波產生豐富低頻諧波
  subOsc.frequency.setValueAtTime(95, now); // 起始低頻 95Hz
  subOsc.frequency.exponentialRampToValueAtTime(36, now + thunderDuration); // 向下滑落至 36Hz 沉重低音
  const subGain = ctx.createGain(); // 建立低頻震盪器音量節點
  subGain.gain.setValueAtTime(0.001, now); // 避免起始爆音
  subGain.gain.linearRampToValueAtTime(0.18, now + 0.03); // 迅速提升低頻力度
  subGain.gain.exponentialRampToValueAtTime(0.001, now + thunderDuration); // 漸弱結束
  subOsc.connect(subGain); // 連接低頻震盪器至音量節點
  subGain.connect(ctx.destination); // 輸出至喇叭
  subOsc.start(now); // 開始低頻震盪
  subOsc.stop(now + thunderDuration); // 到時間自動停止震盪器
} // 結束打雷音效合成函式

function playExplosionSound() { // 以程式合成爆破音效（重低音衝擊下降 + 爆炸碎裂噪音）
  const ctx = ensureAudioContext(); // 取得並確保音訊上下文已啟動
  if (!ctx) return; // 若無法取得音訊上下文則略過
  const now = ctx.currentTime; // 取得目前精準音訊時間（秒）
  const boomDuration = 0.75; // 設定爆破音效總長度為 0.75 秒
  const noiseSource = ctx.createBufferSource(); // 建立爆炸噪音音源
  noiseSource.buffer = createNoiseBuffer(ctx, boomDuration); // 填入噪音緩衝區
  const bandpass = ctx.createBiquadFilter(); // 建立帶通濾波器營造火花爆裂感
  bandpass.type = 'bandpass'; // 設定為帶通濾波器
  bandpass.frequency.setValueAtTime(650, now); // 起始中心頻率 650Hz
  bandpass.frequency.exponentialRampToValueAtTime(120, now + boomDuration); // 爆破後頻率往下沉降
  bandpass.Q.value = 1.4; // 設定適度頻寬避免過於尖銳
  const noiseGain = ctx.createGain(); // 建立爆炸噪音音量控制節點
  noiseGain.gain.setValueAtTime(0.001, now); // 起始極小值防爆音
  noiseGain.gain.linearRampToValueAtTime(0.45, now + 0.02); // 瞬間爆發最大音量
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + boomDuration); // 爆炸聲尾韻漸弱
  noiseSource.connect(bandpass); // 噪音接至帶通濾波器
  bandpass.connect(noiseGain); // 濾波後接至音量節點
  noiseGain.connect(ctx.destination); // 輸出至喇叭
  noiseSource.start(now); // 開始播放爆炸噪音
  noiseSource.stop(now + boomDuration); // 結束爆炸噪音
  const punchOsc = ctx.createOscillator(); // 建立衝擊波震盪器
  punchOsc.type = 'sine'; // 使用正弦波呈現厚實低頻衝擊
  punchOsc.frequency.setValueAtTime(150, now); // 起始頻率 150Hz
  punchOsc.frequency.exponentialRampToValueAtTime(28, now + 0.55); // 快速下潛至 28Hz 模擬地面震動
  const punchGain = ctx.createGain(); // 建立衝擊波音量節點
  punchGain.gain.setValueAtTime(0.35, now); // 爆破瞬間給予強勁低頻
  punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55); // 0.55 秒內衰減完畢
  punchOsc.connect(punchGain); // 連接衝擊波震盪器與音量節點
  punchGain.connect(ctx.destination); // 輸出至喇叭
  punchOsc.start(now); // 開始衝擊波
  punchOsc.stop(now + 0.55); // 停止衝擊波
} // 結束爆破音效合成函式

function preload() { // 在程式開始前載入所有圖片素材，並記錄載入成功或失敗狀態
  idleSheet = loadImage('1/stop/stop合併.png', () => {}, () => { idleSheet = null; }); // 載入待機動畫精靈圖
  runSheet = loadImage('1/run/run合併.png', () => {}, () => { runSheet = null; }); // 載入跑步動畫精靈圖
  backgroundImage = loadImage('background/0.png', () => {}, () => { backgroundImage = null; }); // 載入背景圖片
  effect1Sheet = loadImage( // 載入閃電特效精靈圖
    '特效/特效合併.png', // 相對路徑：特效/特效合併.png
    () => { effect1Loaded = true; }, // 載入成功時標記 effect1Loaded 為 true
    () => { effect1Loaded = false; effect1Sheet = null; } // 載入失敗時避免卡住
  ); // 結束載入特效1
  effect2Sheet = loadImage( // 載入爆破特效精靈圖
    '特效二/特效二合併.png', // 相對路徑：特效二/特效二合併.png
    () => { effect2Loaded = true; }, // 載入成功時標記 effect2Loaded 為 true
    () => { effect2Loaded = false; effect2Sheet = null; } // 載入失敗時避免卡住
  ); // 結束載入特效2
} // 結束素材載入函式

function isBackgroundPixel(img, x, y, bgColor, hasTransparency) { // 判斷某個像素是否屬於背景（透明或純色底）
  const idx = (y * img.width + x) * 4; // 計算像素在 pixels 陣列中的起始索引
  const r = img.pixels[idx]; // 取得紅色色版數值
  const g = img.pixels[idx + 1]; // 取得綠色色版數值
  const b = img.pixels[idx + 2]; // 取得藍色色版數值
  const a = img.pixels[idx + 3]; // 取得透明度色版數值
  if (hasTransparency) { // 若圖片使用透明背景
    return a <= 15; // 透明度極低即視為背景
  } // 結束透明背景判斷
  const diff = Math.abs(r - bgColor.r) + Math.abs(g - bgColor.g) + Math.abs(b - bgColor.b); // 計算與左上角底色的色差總和
  return diff <= 12 || a <= 15; // 色差很小或透明即視為純色背景
} // 結束背景像素判斷函式

function extractSpriteBoxes(sheet, pad = 2) { // 掃描整張精靈圖，依空白間隔自動切出每一個完整角色影格
  if (!sheet) return [{ sx: 0, sWidth: 64 }]; // 若素材未成功載入則回傳預設區間避免報錯
  sheet.loadPixels(); // 載入圖片像素資料
  let transparentCount = 0; // 記錄透明像素數量
  const totalSampled = Math.max(1, sheet.width * sheet.height); // 計算總像素數
  for (let i = 3; i < sheet.pixels.length; i += 4) { // 掃描所有像素的 Alpha 值
    if (sheet.pixels[i] <= 15) transparentCount += 1; // 統計透明像素數
  } // 結束透明度統計
  const hasTransparency = transparentCount / totalSampled > 0.05; // 若超過 5% 像素透明則視為去背透明圖
  const bgColor = { // 取得左上角像素作為純色底參考色
    r: sheet.pixels[0], // 左上角紅色值
    g: sheet.pixels[1], // 左上角綠色值
    b: sheet.pixels[2] // 左上角藍色值
  }; // 結束底色設定
  const colHasSprite = new Array(sheet.width).fill(false); // 建立每一欄是否有角色像素的布林陣列
  for (let x = 0; x < sheet.width; x += 1) { // 由左至右逐欄掃描
    for (let y = 0; y < sheet.height; y += 1) { // 由上至下逐列掃描
      if (!isBackgroundPixel(sheet, x, y, bgColor, hasTransparency)) { // 若找到非背景的角色像素
        colHasSprite[x] = true; // 標記這一欄包含角色內容
        break; // 該欄已確認有角色，跳出垂直迴圈加快速度
      } // 結束角色像素判斷
    } // 結束垂直掃描
  } // 結束水平掃描
  const rawSegments = []; // 儲存連續有角色的水平區段
  let inSegment = false; // 記錄目前是否正在角色區段內
  let segStart = 0; // 記錄目前區段的起始 x 座標
  for (let x = 0; x < sheet.width; x += 1) { // 依序檢查每一欄是否屬於角色
    if (colHasSprite[x] && !inSegment) { // 遇到角色起點
      inSegment = true; // 進入角色區段
      segStart = x; // 記錄起始 x
    } else if (!colHasSprite[x] && inSegment) { // 遇到空白間隔，代表前一個角色結束
      inSegment = false; // 離開角色區段
      rawSegments.push({ start: segStart, end: x - 1 }); // 存入完整角色區段
    } // 結束區段起訖判斷
  } // 結束區段切分迴圈
  if (inSegment) { // 若直到圖片最右側仍在角色區段內
    rawSegments.push({ start: segStart, end: sheet.width - 1 }); // 補上最後一個角色區段
  } // 結束尾部區段處理
  const mergedSegments = []; // 合併可能因細微空隙拆開的同一角色區段
  for (const seg of rawSegments) { // 逐一檢視切出的區段
    const prev = mergedSegments[mergedSegments.length - 1]; // 取得前一個已存入的區段
    if (prev && seg.start - prev.end <= 4) { // 若兩段距離小於等於 4 像素，視為同一角色的細部
      prev.end = seg.end; // 合併到前一個區段
    } else if (seg.end - seg.start >= 4) { // 過濾掉極小的雜點噪訊
      mergedSegments.push({ start: seg.start, end: seg.end }); // 加入有效角色區段
    } // 結束區段合併判斷
  } // 結束合併迴圈
  if (mergedSegments.length === 0) { // 若整張圖沒有偵測出明顯間隔（保險備援）
    return [{ sx: 0, sWidth: sheet.width }]; // 回傳整張圖作為單一影格
  } // 結束無間隔備援判斷
  return mergedSegments.map((seg) => { // 將每個角色區段轉為裁切參數 { sx, sWidth }
    const sx = Math.max(0, seg.start - pad); // 左側留白 padding，避免貼邊
    const right = Math.min(sheet.width, seg.end + 1 + pad); // 右側留白 padding，避免切到角色邊緣
    return { sx, sWidth: right - sx }; // 回傳精準裁切起點與寬度
  }); // 結束區段轉換
} // 結束全圖精靈影格切分函式

function getSheetFrameSlice(sheet, expectedFrameH, totalFrames, index) { // 依實際圖片尺寸與影格索引計算裁切矩形（支援單列或多列）
  const rows = Math.max(1, Math.round(sheet.height / expectedFrameH)); // 依實際高度推算精靈圖共有幾列
  const cols = Math.max(1, Math.ceil(totalFrames / rows)); // 依總影格數與列數推算每列有幾欄
  const row = Math.min(rows - 1, Math.floor(index / cols)); // 計算目前影格所在的列索引（從 0 開始）
  const col = index % cols; // 計算目前影格所在的欄索引（從 0 開始）
  const exactW = sheet.width / cols; // 依實際圖片寬度與欄數計算每格理論寬度
  const sx = round(col * exactW); // 四捨五入計算來源 x 起點
  const nextSx = col === cols - 1 ? sheet.width : round((col + 1) * exactW); // 計算下一欄起點或實際總寬
  const sWidth = Math.max(1, nextSx - sx); // 計算來源寬度
  const exactH = sheet.height / rows; // 依實際圖片高度與列數計算每格高度
  const sy = round(row * exactH); // 四捨五入計算來源 y 起點
  const nextSy = row === rows - 1 ? sheet.height : round((row + 1) * exactH); // 計算下一列起點或實際總高
  const sHeight = Math.max(1, nextSy - sy); // 計算來源高度
  return { sx, sy, sWidth, sHeight }; // 回傳完整來源裁切資訊
} // 結束精靈圖影格切片計算函式

function updateBgTileWidth() { // 更新單張背景依畫布高度等比例縮放後的寬度
  if (backgroundImage && backgroundImage.height > 0) { // 確認背景圖已載入且高度有效
    backgroundTileWidth = backgroundImage.width * height / backgroundImage.height; // 依畫布高度等比例計算單張背景寬度
  } else { // 若背景圖尚未載入完成
    backgroundTileWidth = width; // 使用視窗寬度作為備援數值
  } // 結束背景寬度計算
} // 結束更新背景寬度函式

function resetLayout() { // 依目前畫布尺寸初始化背景與角色位置
  updateBgTileWidth(); // 更新單張背景寬度
  backgroundOffset = (width - backgroundTileWidth) / 2; // 將中間主背景置中，左右各複製一份串接
  characterX = width / 2; // 將角色初始位置放在整個視窗的正中間
  rightBgStopped = false; // 重置右邊複製背景停止狀態
  effectCycleActive = false; // 重置特效循環狀態
  lastPlayedSoundKey = ''; // 重置音效播放紀錄
} // 結束版面初始化函式

function setup() { // 初始化畫布與繪圖設定
  createCanvas(windowWidth, windowHeight); // 建立符合目前視窗大小的畫布
  imageMode(CORNER); // 使用圖片左上角作為繪製座標
  idleFramesBox = extractSpriteBoxes(idleSheet, 2); // 自動切分待機精靈圖的所有角色影格
  runFramesBox = extractSpriteBoxes(runSheet, 2); // 自動切分跑步精靈圖的所有角色影格
  resetLayout(); // 初始化背景與角色位置
} // 結束初始化函式

function drawEffects(canTriggerNew, fx) { // 控制閃電與爆破特效循環及對應合成音效
  const now = millis(); // 取得目前經過的時間（毫秒）
  const isInsideScreen = fx >= 0 && fx <= width; // 判斷最右邊背景的1/4位置目前是否仍在視窗畫面內
  if (!effectCycleActive) { // 若目前尚未啟動特效循環
    if (!canTriggerNew || !isInsideScreen) { // 尚未到達停止觸發點或位置不在畫面內時不啟動
      lastPlayedSoundKey = ''; // 清除音效鍵值以便下次重新觸發
      return; // 結束特效繪製
    } // 結束啟動條件判斷
    effectCycleActive = true; // 啟動特效循環
    effectCycleStartedAt = now; // 記錄本輪循環起始時間
    effectAnchorOffsetFromBg = fx - backgroundOffset; // 鎖定此位置相對於背景的錨點，讓背景轉動時位置跟著移動
  } // 結束循環初始化判斷
  const currentEffectX = backgroundOffset + effectAnchorOffsetFromBg; // 依目前背景位置計算該1/4位置所在的即時畫面 x 座標
  if (currentEffectX < 0 || currentEffectX > width) { // 當畫面離開了最右邊背景的最右邊1/4位置時
    effectCycleActive = false; // 停止打雷與爆破效果
    lastPlayedSoundKey = ''; // 重置音效播放紀錄
    return; // 結束特效繪製
  } // 結束離開畫面停止判斷
  const lightningTotalMs = effect1CycleMs * effect1RepeatCount; // 計算3次閃電的總時間（3000毫秒）
  const fullCycleMs = lightningTotalMs + effect2CycleMs; // 計算「閃電3次 + 爆破1次」完整一輪的總時間（4000毫秒）
  const totalElapsed = now - effectCycleStartedAt; // 計算自循環開始至今經過的總毫秒數
  const cycleIndex = floor(totalElapsed / fullCycleMs); // 計算目前處於第幾大輪循環
  const cycleElapsed = totalElapsed % fullCycleMs; // 計算目前在完整循環中的經過時間，實現不斷重複播放
  if (cycleElapsed < lightningTotalMs) { // 前3秒（第1～3次）播放由上而下的閃電特效
    const lightningRound = floor(cycleElapsed / effect1CycleMs); // 計算目前是本輪第幾次閃電（0、1、2）
    const soundKey = `cycle-${cycleIndex}-lightning-${lightningRound}`; // 產生本次閃電的唯一音效鍵值
    if (soundKey !== lastPlayedSoundKey) { // 每次閃電開始時播放一次打雷合成音效
      lastPlayedSoundKey = soundKey; // 記錄已播放的閃電音效鍵值
      playThunderSound(); // 播放打雷音效
    } // 結束打雷音效觸發判斷
    if (effect1Loaded && effect1Sheet) { // 確認閃電素材已成功載入
      const singleProgress = (cycleElapsed % effect1CycleMs) / effect1CycleMs; // 計算單次1秒閃電的播放進度（0～1）
      const frameIdx1 = Math.min(effect1Frames - 1, floor(singleProgress * effect1Frames)); // 計算閃電影格索引（0～13）
      const slice1 = getSheetFrameSlice(effect1Sheet, effect1FrameH, effect1Frames, frameIdx1); // 取得閃電目前影格裁切區間
      const drawW1 = slice1.sWidth * characterScale; // 計算閃電顯示寬度
      const drawH1 = slice1.sHeight * characterScale; // 計算閃電顯示高度
      const maxTravelY = Math.max(0, height - drawH1); // 計算由視窗最上方往下移動的最大垂直距離
      const fy1 = singleProgress * maxTravelY; // 由視窗最上方（0）往下移動
      image(effect1Sheet, currentEffectX - drawW1 / 2, fy1, drawW1, drawH1, slice1.sx, slice1.sy, slice1.sWidth, slice1.sHeight); // 繪製閃電特效影格
    } // 結束閃電繪製判斷
  } else { // 閃電3次結束後，在視窗最底端播放爆破特效（1秒）
    const soundKey = `cycle-${cycleIndex}-explosion`; // 產生本次爆破的唯一音效鍵值
    if (soundKey !== lastPlayedSoundKey) { // 進入爆破階段時播放一次爆破合成音效
      lastPlayedSoundKey = soundKey; // 記錄已播放的爆破音效鍵值
      playExplosionSound(); // 播放爆破音效
    } // 結束爆破音效觸發判斷
    if (effect2Loaded && effect2Sheet) { // 確認爆破素材已成功載入
      const blastElapsed = cycleElapsed - lightningTotalMs; // 計算爆破特效已播放的時間（0～1000毫秒）
      const blastProgress = Math.min(0.9999, blastElapsed / effect2CycleMs); // 計算爆破播放進度（0～1）
      const frameIdx2 = Math.min(effect2Frames - 1, floor(blastProgress * effect2Frames)); // 計算爆破影格索引（0～9）
      const slice2 = getSheetFrameSlice(effect2Sheet, effect2FrameH, effect2Frames, frameIdx2); // 取得爆破目前影格裁切區間
      const drawW2 = slice2.sWidth * characterScale; // 計算爆破顯示寬度
      const drawH2 = slice2.sHeight * characterScale; // 計算爆破顯示高度
      image(effect2Sheet, currentEffectX - drawW2 / 2, height - drawH2, drawW2, drawH2, slice2.sx, slice2.sy, slice2.sWidth, slice2.sHeight); // 在視窗最底端繪製爆破特效
    } // 結束爆破繪製判斷
  } // 結束閃電與爆破階段切換
} // 結束特效繪製函式

function draw() { // 每個畫面更新時繪製背景、角色與特效
  background(0); // 清除上一個畫面，避免畫面殘影
  updateBgTileWidth(); // 隨畫布高度更新單張背景寬度
  const centerX = width / 2; // 計算整個視窗的水平中心點
  const totalBgLeftEdge = backgroundOffset - backgroundTileWidth; // 計算左側複製背景的最左邊界
  const totalBgRightEdge = backgroundOffset + backgroundTileWidth * 2; // 計算右側複製背景的最右邊界
  const firstRunBox = runFramesBox[0] || { sx: 0, sWidth: runSheet ? runSheet.width : 64 }; // 取得跑步第一格裁切資訊
  const characterHalfWidth = firstRunBox.sWidth * characterScale / 2; // 計算角色一半顯示寬度作為左右邊界限制
  const stepDistance = backgroundSpeed * deltaTime / 1000; // 計算本影格可移動的像素距離
  const rightLimitOffset = width - backgroundTileWidth * 2; // 計算右邊複製背景最右邊碰到視窗右邊時的基準偏移量
  if (direction > 0) { // 按下往右鍵時
    const isAtCenter = Math.abs(characterX - centerX) <= 1; // 判斷角色1是否位於整個視窗的中間
    const canMoveBgLeft = isAtCenter && totalBgRightEdge > width + 1; // 角色在中間且右邊複製背景尚未碰到視窗右邊時，背景才往左移動
    if (canMoveBgLeft) { // 背景可繼續往左移
      characterX = centerX; // 鎖定角色在視窗中間
      backgroundOffset = Math.max(backgroundOffset - stepDistance, rightLimitOffset); // 背景往左移動
      if (backgroundOffset <= rightLimitOffset + 2) { // 當右邊複製背景碰到視窗右邊並停止移動時
        rightBgStopped = true; // 標記右邊複製背景已停止移動
      } // 結束右邊背景停止判斷
    } else { // 角色不在中間，或右邊複製背景已停止移動
      if (totalBgRightEdge <= width + 2) { // 右邊複製背景已停止移動
        rightBgStopped = true; // 標記右邊複製背景已停止移動
      } // 結束右邊背景狀態確認
      characterX = Math.min(characterX + stepDistance, width - characterHalfWidth); // 角色1往右移動，直到碰到視窗最右端暫停移動
    } // 結束往右移動判斷
  } else if (direction < 0) { // 按下往左鍵時
    const isAtCenter = Math.abs(characterX - centerX) <= 1; // 判斷角色1是否位於整個視窗的中間
    const canMoveBgRight = isAtCenter && totalBgLeftEdge < -1; // 角色在中間且整體背景最左邊尚未碰到視窗左邊時，背景才往右移動
    if (canMoveBgRight) { // 背景可繼續往右移
      characterX = centerX; // 鎖定角色在視窗中間
      backgroundOffset = Math.min(backgroundOffset + stepDistance, backgroundTileWidth); // 背景往右移動，直到整體背景最左邊碰到視窗左邊
    } else { // 角色不在中間，或整體背景最左邊已碰到視窗左邊
      characterX = Math.max(characterX - stepDistance, characterHalfWidth); // 角色1往左移動，直到碰到視窗最左端暫停移動
    } // 結束往左移動判斷
  } // 結束方向鍵移動邏輯
  if (backgroundImage) { // 確認背景圖片已成功載入
    for (let tile = -1; tile <= 1; tile += 1) { // 左右各複製一份背景並做連結串接（共 -1、0、1 三張相連）
      image(backgroundImage, backgroundOffset + tile * backgroundTileWidth, 0, backgroundTileWidth, height); // 等比例繪製每張相連背景圖
    } // 結束背景繪製
  } // 結束背景存在判斷
  const isRunning = direction !== 0; // 判斷角色目前是否正在播放跑步動畫
  const sheet = isRunning ? runSheet : idleSheet; // 依照動作選擇跑步或待機精靈圖
  const boxes = isRunning ? runFramesBox : idleFramesBox; // 依照動作選擇對應的影格裁切陣列
  if (sheet && boxes.length > 0) { // 確認角色精靈圖與影格資料皆可用
    const totalBoxes = boxes.length; // 取得目前精靈圖實際切出的影格總數
    let frameIndex = 0; // 預設使用第 0 格
    if (isRunning) { // 跑步時先播放開場影格，再循環前三格
      const elapsedFrames = floor((millis() - runStartedAt) / frameDuration); // 計算跑步動畫已播放的影格數
      const introCount = Math.min(runSequenceCount, totalBoxes); // 確保開場影格數不超過實際切出總數
      const loopCount = Math.min(3, totalBoxes); // 確保循環影格數不超過實際切出總數
      frameIndex = elapsedFrames < introCount ? elapsedFrames : (elapsedFrames - introCount) % loopCount; // 計算目前跑步影格索引
    } else { // 待機時循環播放所有切出的影格
      frameIndex = floor(millis() / frameDuration) % totalBoxes; // 依時間循環切換待機影格
    } // 結束影格選擇
    const { sx, sWidth } = boxes[frameIndex]; // 取出目前影格完整的來源起點 sx 與來源寬度 sWidth
    const characterWidth = sWidth * characterScale; // 計算角色影格顯示寬度
    const characterHeight = sheet.height * characterScale; // 計算角色影格顯示高度
    push(); // 暫存畫布狀態以便只翻轉角色圖片
    translate(characterX, height - characterHeight); // 將角色定位於目前水平位置與地面
    if (direction < 0) { // 向左移動時將角色左右翻轉
      scale(-1, 1); // 水平鏡射角色圖片
    } // 結束角色翻轉判斷
    image(sheet, -characterWidth / 2, 0, characterWidth, characterHeight, sx, 0, sWidth, sheet.height); // 擷取並繪製目前精靈圖影格
    pop(); // 還原畫布狀態，避免影響背景或後續繪圖
  } // 結束角色繪製判斷
  const canTriggerEffect = rightBgStopped || totalBgRightEdge <= width + 2; // 判斷右邊複製背景是否已停止移動
  const rightBgQuarterFromRightX = totalBgRightEdge - backgroundTileWidth * 0.25; // 計算最右邊背景的最右邊1/4位置水平座標
  drawEffects(canTriggerEffect, rightBgQuarterFromRightX); // 繪製並追蹤該位置的閃電與爆破特效循環
} // 結束每畫面繪製函式

function mousePressed() { // 點擊畫布時確保音訊上下文已解鎖
  ensureAudioContext(); // 解鎖瀏覽器音訊播放限制
} // 結束滑鼠點擊函式

function keyPressed() { // 按下方向鍵時解鎖音訊並開始對應方向的跑步動畫
  ensureAudioContext(); // 透過按鍵互動解鎖音訊上下文
  if (keyCode === RIGHT_ARROW || keyCode === LEFT_ARROW) { // 只處理左右方向鍵
    if (activeKeyCode !== keyCode) { // 新方向開始時重新播放跑步動畫開場
      activeKeyCode = keyCode; // 記錄目前按住的方向鍵
      direction = keyCode === RIGHT_ARROW ? 1 : -1; // 設定移動方向與角色朝向
      runStartedAt = millis(); // 記錄跑步動畫開場時間
    } // 結束新方向判斷
    return false; // 阻止方向鍵造成瀏覽器頁面捲動
  } // 結束左右方向鍵處理
} // 結束按鍵按下函式

function keyReleased() { // 放開方向鍵時停止移動並回到待機動畫
  if (keyCode === activeKeyCode) { // 只在放開目前控制方向的按鍵時停止
    activeKeyCode = 0; // 清除目前按住的方向鍵
    direction = 0; // 停止移動並切換回待機動作
    return false; // 阻止方向鍵造成瀏覽器頁面捲動
  } // 結束放開方向鍵判斷
} // 結束按鍵放開函式

function windowResized() { // 視窗尺寸改變時同步調整畫布
  resizeCanvas(windowWidth, windowHeight); // 讓畫布符合最新視窗大小
  resetLayout(); // 重新計算背景寬度與置中位置
} // 結束視窗尺寸調整函式