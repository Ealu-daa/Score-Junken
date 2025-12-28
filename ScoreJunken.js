/* =========================
   Score Junken Core Logic
   ========================= */

  window.addEventListener("load", async () => {
  console.log("ver0.3.0");
  
  checkTimeout();
  setInterval(checkTimeout, CHECK_INTERVAL);
});

// ===== Firebase 初期化 =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDwZQfWkf_h-Dc219uJpTtJNJElZ5l-0Ok",
  authDomain: "score-junken-online.firebaseapp.com",
  projectId: "score-junken-online",
  storageBucket: "score-junken-online.firebasestorage.app",
  messagingSenderId: "656405933288",
  appId: "1:656405933288:web:122a765c95d61b0a0ded5d",
  measurementId: "G-5SDM8HE1N1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app); // Firestore を使えるようにする

let playerId = null; // "player1" or "player2"
let roomId = "room001";
const maxRound = 15;

let unsubscribe = null; // 前回の onSnapshot を解除するため


import { getAuth, GoogleAuthProvider, signInWithPopup, setPersistence, browserLocalPersistence, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const auth = getAuth();
const provider = new GoogleAuthProvider();

// 認証の永続化
await setPersistence(auth, browserLocalPersistence);

const loginBtn = document.getElementById("google-login");
const anonBtn = document.getElementById("anon-login");
const logoutBtn = document.getElementById("google-logout");

// Googleログイン
loginBtn.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    console.log("Googleログイン成功:", result.user.uid, result.user.displayName);
  } catch (error) {
    console.error("Googleログイン失敗", error);
  }
});

// 匿名ログイン
anonBtn.addEventListener("click", async () => {
  try {
    const userCredential = await signInAnonymously(auth);
    console.log("匿名ログイン成功:", userCredential.user.uid);
  } catch (error) {
    console.error("匿名ログイン失敗", error);
  }
});

// ログアウト
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  console.log("ログアウトしました");
});

// ログイン状態監視
onAuthStateChanged(auth, user => {
  if(user){
    window.currentUID = user.uid;

    if(user.isAnonymous){
      loginBtn.textContent = "匿名ログイン中";
      anonBtn.style.display = "none"; // 匿名ログインボタン非表示
    } else {
      loginBtn.textContent = `Googleでログイン済み: ${user.displayName}`;
      anonBtn.style.display = "inline-block"; // 匿名ログインボタンは他ユーザー用に表示
    }

    loginBtn.disabled = true; // ログインボタンは押せなくする
    logoutBtn.style.display = "inline-block"; // ログアウト表示
  } else {
    window.currentUID = null;

    loginBtn.textContent = "Googleでログイン";
    loginBtn.disabled = false;
    anonBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
  }
});

//ロード時
const roomIds = ["room001", "room002", "room003"];

const TIMEOUT_LIMIT = 3 * 60 * 1000; // 3分
const CHECK_INTERVAL = 10 * 1000;    // 10秒監視

async function checkTimeout() {
  const now = Date.now();
   console.log("checkTimeout 呼ばれた", new Date().toLocaleTimeString());

  for (const rid of roomIds) {
    const gameRef = doc(db, "games", rid);
    const snap = await getDoc(gameRef);
    if (!snap.exists()) continue;

    const data = snap.data();

    for (const pid of ["player1", "player2"]) {
      const p = data[pid];
      if (!p?.join || !p?.lastActive || !p.lastActive.toMillis) continue;

      const diff = now - p.lastActive.toMillis();
      console.log(`${pid}@${rid}: ${Math.floor(diff/1000)}秒前`);

      if (diff > TIMEOUT_LIMIT) {
        await updateDoc(gameRef, {
          [`${pid}.join`]: false
        });
        console.log(`${pid}@${rid} timeout → 退出`);
      }
    }
  }
}



// ===== 左手・右手 定義 =====
const HAND = { ROCK:0, SCISSORS:1, PAPER:2 };
const RIGHT = {
  BLOCK: 0,
  LIGHT: 1,
  DRIVE: 2,
  COUNTER: 3,
  TRICK: 4,
  REVERSAL: 5,
  COSMIC: 6
};

// ===== ゲーム状態 =====
let playerScore = 0;
let cpuScore = 0;
let history = [];
let round = 1;
let selectedLeft = null;
let selectedRight = null;

let nearEndGame = false;
let cpuBlockCount = 0;
let cpuReversalUsed = false;
let blockCount = 0;
let reversalUsed = false;

let onlineEndGame = false;
let onlinePBlockCount = 0;
let onlinePReversal = false;

// ===== 勝敗判定 (左手) =====
function judgeLeft(player, opponent){
  if(player === opponent) return 0;
  return ((player + 1) % 3 === opponent) ? 1 : -1;
}

// ===== スコア計算=====

/*
ラウンド数15
  [右手アクション定義]

  数字 | 名前         | 勝   | あいこ | 負   | 役割
  ------------------------------------------------
   0   | ブロック     | -10*  | -10   | -10   | 逃げ／準備
   1   | ライト       | +10   |  0    |  0    | 安定
   2   | ドライブ     | +25   |  0    | -10   | 攻め
   3   | カウンター   |  ?    |   ?   |   ?   | 読み
   4   | トリック     |  0    | +25   | -20   | 攪乱
   5   | リバーサル   | +50   |  0    | -50   | 逆転

  ※ 特殊ルール
  ・?相手がカウンターの場合、相手の得点と自分の得点を反転させて、自分の得点は常に0
  ・*相手がブロックの場合、自分の得点は常に 0
  ・*ブロックは1回目：-10,2回目：-20,3回目：-30,4回目以降：使用不可
  ・残り3ラウンドでは：
    ・ライト 勝+15
    ・トリック あいこ+35
  ・リバーサルは1試合1回のみ
*/
function calcScore(leftResult, selfRight, oppRight, blockCount = 0, isEndGame = false) {

  // 相手がブロック → 自分の得点は常に0
  if (oppRight === RIGHT.BLOCK) {
    return 0;
  }

  if (oppRight === selfRight && leftResult === 0) {
    return 0;
  }

  switch (selfRight) {

    // 0｜ブロック
    case RIGHT.BLOCK: {
      // 使用回数によるペナルティ
      const penalty = -(blockCount + 1) * 10;
      return penalty;
    }

    // 1｜ライト
    case RIGHT.LIGHT: {
      if (leftResult === 1) return isEndGame ? 15 : 10;
      return 0;
    }

    // 2｜ドライブ
    case RIGHT.DRIVE: {
      if (leftResult === 1) return 25;
      if (leftResult === -1) return -10;
      return 0;
    }

    // 3｜カウンター
    case RIGHT.COUNTER: {
      return 0;
    }

    // 4｜トリック
    case RIGHT.TRICK: {
      if (leftResult === 0) return isEndGame ? 35 : 25;
      if (leftResult === -1) return -20;
      return 0;
    }

    // 5｜リバーサル（1試合1回管理は外で）
    case RIGHT.REVERSAL: {
      if (leftResult === 1) return 50;
      if (leftResult === -1) return -50;
      return 0;
    }

    // 6｜コズミック
    case RIGHT.COSMIC: {
      if (leftResult === 1) return 9999;
      if (leftResult === -1) return -9999;
      return 0;
    }
  }

  return 0;
}

// ===== CPUロジック =====
// 左手CPU
function cpuLeft(playerHistory){
  if(playerHistory.length < 3)
    return Math.floor(Math.random() * 3);

  const counts = [0,0,0];
  for(const h of playerHistory) counts[h.left]++;

  const max = Math.max(...counts);
  const likely = counts.indexOf(max);

  // 70%で読む、30%で外す
  return Math.random() < 0.7
    ? (likely + 1) % 3
    : Math.floor(Math.random() * 3);
}

// 左手の結果ごとの勝ち/あいこ/負け確率
function estimateLeftProb(leftResult){
  switch(leftResult){
    case  1: return { win:0.5, draw:0.3, lose:0.2 };
    case  0: return { win:0.3, draw:0.4, lose:0.3 };
    case -1: return { win:0.2, draw:0.3, lose:0.5 };
    default: return { win:0.33, draw:0.34, lose:0.33 };
  }
}

// 右手スコア（特殊ラウンド考慮なし）
const RIGHT_SCORE = {
  [RIGHT.BLOCK]:    { win:-10, draw:-10, lose:-10 },
  [RIGHT.LIGHT]:    { win:10, draw:0, lose:0 },
  [RIGHT.DRIVE]:    { win:25, draw:0, lose:-10 },
  [RIGHT.COUNTER]:  { win:-15, draw:-10, lose:35 },
  [RIGHT.TRICK]:    { win:0, draw:25, lose:-20 },
  [RIGHT.REVERSAL]: { win:50, draw:0, lose:-50 }
};

// 特殊ルール込みで期待値計算
function calcEV(right, leftResult, oppRight, round, maxRound, blockCount) {
  const p = estimateLeftProb(leftResult);
  let s = { ...RIGHT_SCORE[right] };

  // 残り3ラウンドの強化
  if (maxRound - round <= 3) {
    if (right === RIGHT.LIGHT) s.win += 15;
    if (right === RIGHT.TRICK) s.draw += 35;
  }

  // ブロックの使用回数反映
  if (right === RIGHT.BLOCK) {
    if (blockCount === 1) s.win = s.draw = s.lose = -20;
    if (blockCount === 2) s.win = s.draw = s.lose = -30;
    if (blockCount >= 3) return -Infinity; // 使用不可
  }

  // 相手がブロックの場合、自分の得点は常に0
  if (oppRight === RIGHT.BLOCK) return 0;

  // 相手がカウンターの場合の処理
  if (oppRight === RIGHT.COUNTER) {
    // 勝ちは 0 に
    s.win = 0;
    // 負けは相手にプラス → 自分は 0 に見えるが、期待値計算では反転
    s.lose = -s.lose;
  }

  return p.win  * s.win +
         p.draw * s.draw +
         p.lose * s.lose;
}

// 右手CPU
function cpuRight(
  playerHistory,
  cpuLeftChoice,
  round,
  maxRound,
  reversalUsed,
  blockCount
){
  const last = playerHistory.at(-1);
  const leftResult = last ? judgeLeft(cpuLeftChoice, last.left) : 0;
  const oppRight = last ? last.right : null;

  // 使用可能な右手
  const candidates = [
    RIGHT.LIGHT,
    RIGHT.DRIVE,
    RIGHT.COUNTER,
    RIGHT.TRICK
  ];

  // ブロック制限
  if(blockCount < 3) candidates.push(RIGHT.BLOCK);

  // リバーサル制限
  if(!reversalUsed) candidates.push(RIGHT.REVERSAL);

  // 期待値計算
  const scored = candidates.map(r => ({
    right: r,
    ev: calcEV(r, leftResult, oppRight, round, maxRound, blockCount)
  }));

  // ソート
  scored.sort((a,b)=>b.ev - a.ev);

  // 人間らしい揺らぎ
  const r = Math.random();
  if(r < 0.75) return scored[0].right;
  if(r < 0.95) return scored[1]?.right ?? scored[0].right;
  return scored[Math.floor(Math.random()*scored.length)].right;
}


// ===== ルーム初期化（存在しなければ作る） =====
async function checkAndInitRoom() {
  const gameRef = doc(db, "games", roomId);
  const docSnap = await getDoc(gameRef);

  if (!docSnap.exists()) {
    // まだ部屋がなければ新規作成
    await setDoc(gameRef, {
      player1: { join: false, left: null, right: null, score: 0, lastActive: serverTimestamp()},
      player2: { join: false, left: null, right: null, score: 0, lastActive: serverTimestamp()},
      round: 1,
      status: "playing"
    });
    console.log("新規ルーム作成");
    return;
  }

  const data = docSnap.data() || {};

  onlineEndGame = false;
  onlinePBlockCount = 0;
  onlinePReversal = false;

  // 誰もいなければ初期化
  const p1Empty = !data.player1?.join;
  const p2Empty = !data.player2?.join;

  if (p1Empty && p2Empty) {
    await setDoc(gameRef, {
      player1: { join: false, left: null, right: null, score: 0, lastActive: serverTimestamp()},
      player2: { join: false, left: null, right: null, score: 0, lastActive: serverTimestamp()},
      round: 1,
      status: "playing"
    });
    console.log("誰もいなかったので部屋を初期化しました");
  }
}
  
async function assignPlayer() {
  const gameRef = doc(db, "games", roomId);
  const docSnap = await getDoc(gameRef);
  const data = docSnap.data() || {};

  if (!playerId) {
    if (!data.player1?.join) {
      playerId = "player1";
    } else if (!data.player2?.join) {
      playerId = "player2";
    } else {
      playerId = Math.random() < 0.5 ? "player1" : "player2";
    }
    console.log("自動割り当て:", playerId);
  } else {
    console.log("ボタンで選択済み:", playerId);
  }

  await updateDoc(gameRef, {
    [`${playerId}.uid`]: window.currentUID,
    [`${playerId}.join`]: true
  });

  if (playerId === "player1") {
    window.opponentUID = data.player2?.uid || null;
  } else if (playerId === "player2") {
    window.opponentUID = data.player1?.uid || null;
  }
}

// ===== 手の選択 =====
window.chooseHand = async function(handType, value) {
  if (!playerId && window.isOnline) return alert("プレイヤーが未割り当てです");

  //アクティブタイムスタンプ更新
  updateDoc(doc(db, "games", roomId), {
  [`${playerId}.lastActive`]: serverTimestamp()
  });

  // ボタンハイライト
  if(handType === "left") {
    selectedLeft = value;
    highlight(".hands:nth-of-type(1) button", value);
  } else if(handType === "right") {
    //ブロック
    if (value === 0)
    {
      if (window.isOnline && onlinePBlockCount < 3)
      {
        selectedRight = value;
        highlight(".hands:nth-of-type(2) button", value);
      }
      if (!window.isOnline && blockCount < 3)
      {
        selectedRight = value;
        highlight(".hands:nth-of-type(2) button", value);
      }
      else
      {
        console.log("使用回数を超過しました")
      }
    }
    //リバーサル
    else if (value === 5)
    {
      if (window.isOnline && !onlinePReversal)
      {
        selectedRight = value;
        highlight(".hands:nth-of-type(2) button", value);
      }
      if (!window.isOnline && !reversalUsed)
      {
        selectedRight = value;
        highlight(".hands:nth-of-type(2) button", value);
      }
      else
      {
        console.log("使用回数を超過しました")
      }
    }
    else
    {
      selectedRight = value;
      highlight(".hands:nth-of-type(2) button", value);
    }
  }

  if (window.isOnline) {
    // オンライン戦: Firestore に送信
    const gameRef = doc(db, "games", roomId);
    const updateObj = {};
    updateObj[`${playerId}.${handType}`] = value;
    await updateDoc(gameRef, updateObj);
  } else {
    // CPU戦: 両手が揃ったらターン進行
    if (selectedLeft !== null && selectedRight !== null) {
      const result = playTurn(selectedLeft, selectedRight, blockCount);
      updateGameUI(result);
      // 選択状態リセット
      selectedLeft = null;
      selectedRight = null;
      document.querySelectorAll(".hands button").forEach(btn => btn.classList.remove("selected"));
    }
  }
}

// ===== 1ターン進行 =====


function playTurn(playerLeft, playerRight, blockCount){
  const cpuL = cpuLeft(history);
  const cpuR = cpuRight(history, cpuL, round, maxRound, cpuReversalUsed, cpuBlockCount);

  const pResult = judgeLeft(playerLeft, cpuL);
  const cResult = -pResult;

  if (maxRound - round <= 3)
    nearEndGame = true;

  let pGain = calcScore(pResult, playerRight, cpuR, blockCount, nearEndGame);
  let cGain = calcScore(cResult, cpuR, playerRight, cpuBlockCount, nearEndGame);

  if (cpuR === RIGHT.COUNTER) {
  cGain = pGain; 
  pGain = 0;
  }

  if (playerRight === RIGHT.COUNTER) {
    pGain = cGain;
    cGain = 0;
  }

  if (playerRight === RIGHT.BLOCK)
    blockCount++;

  if (playerRight === RIGHT.REVERSAL)
    reversalUsed = true;

  if (cpuR === RIGHT.BLOCK)
    cpuBlockCount++;

  if (cpuR === RIGHT.REVERSAL)
    cpuReversalUsed = true;

  playerScore += pGain;
  cpuScore += cGain;

  history.push({left:playerLeft, right:playerRight});

  return {
    player:{left:playerLeft, right:playerRight, gain:pGain},
    cpu:{left:cpuL, right:cpuR, gain:cGain},
    score:{player:playerScore, cpu:cpuScore}
  };
}

// ===== UI補助 =====
function handName(v){ return ["グー","チョキ","パー"][v]; }
function rightName(v){ return {0:"ブロック",1:"ライト",2:"ドライブ",3:"カウンター",4:"トリック",5:"リバーサル"}[v]; }
function format(n){ return n>0?"+"+n:n.toString(); }

function highlight(groupSelector,index){
  document.querySelectorAll(groupSelector).forEach((btn,i)=>{
    btn.classList.toggle("selected", i===index);
  });
}

function updateGameUI(result) {
  // スコア表示
  document.getElementById("pScore").textContent = result.score.player;
  document.getElementById("cScore").textContent = result.score.cpu;

  // ログに追記
  const logEl = document.getElementById("log");
  logEl.textContent += 
    `ラウンド ${round} 結果:\n` +
    `あなた：${handName(result.player.left)} / ${rightName(result.player.right)}  (${format(result.player.gain)})\n` +
    `CPU：${handName(result.cpu.left)} / ${rightName(result.cpu.right)}  (${format(result.cpu.gain)})\n\n`;

  logEl.scrollTop = logEl.scrollHeight;
  
  round++;
  document.getElementById("round").textContent = round;

  if (round > maxRound) {
    endGame();
  }
}

// ===== ゲーム終了 =====
function endGame(){
  let winner;
  if(playerScore>cpuScore) winner="あなたの勝ち！🎉";
  else if(playerScore<cpuScore) winner="CPUの勝ち！💻";
  else winner="引き分け！🤝";

  const logEl = document.getElementById("log");
  logEl.textContent += `=== ゲーム終了 ===\n${winner}\n`;
  logEl.scrollTop = logEl.scrollHeight;

  document.querySelectorAll(".hands button").forEach(btn => btn.disabled=true);

  // リセットボタン追加
  const resetBtn = document.createElement("button");
  resetBtn.textContent="もう一度プレイ";
  resetBtn.classList.add("reset-btn");
  resetBtn.onclick=resetGame;
  document.body.appendChild(resetBtn);
}

async function endGameOnline(pScore, cScore) {

  if(window.currentUID && window.opponentUID){
    // 勝敗に応じてレートを計算・更新
    await updateRateAfterMatch(window.currentUID, window.opponentUID, pScore, cScore);

    // 更新したレートを表示
    await updateRateDisplay(window.currentUID, window.opponentUID);
  }

  const logEl = document.getElementById("log");
  let winner = "";
  if (pScore > cScore) winner = "あなたの勝ち！🎉";
  else if (pScore < cScore) winner = "相手の勝ち！💻";
  else winner = "引き分け！🤝";

  logEl.textContent += `=== ゲーム終了 ===\n${winner}\n`;
  logEl.scrollTop = logEl.scrollHeight;

  document.querySelectorAll(".hands button").forEach(btn => btn.disabled = true);

  // リセットボタン
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "もう一度プレイ";
  resetBtn.onclick = async () => {
    await setDoc(doc(db, "games", "room001"), {
      player1: { left: null, right: null, score: 0 },
      player2: { left: null, right: null, score: 0 },
      round: 1,
      status: "playing"
    });
    document.querySelectorAll(".hands button").forEach(btn => btn.disabled = false);
    document.getElementById("log").textContent = "左手と右手を選んでください";
    resetBtn.remove();
  };
  document.body.appendChild(resetBtn);
}

// ===== ゲームリセット =====
function resetGame(set = true){
  round = 1;
  playerScore = 0;
  cpuScore = 0;
  history = [];
  selectedLeft = null;
  selectedRight = null;
  nearEndGame = false;
  cpuBlockCount = 0;
  cpuReversalUsed = false;
  blockCount = 0;
  reversalUsed = false;

  document.getElementById("pScore").textContent = 0;
  document.getElementById("cScore").textContent = 0;
  document.getElementById("round").textContent = 1;
  document.getElementById("log").textContent = "左手と右手を選んでください";

  if (set === true)
  {
    document.querySelectorAll(".hands button").forEach(btn => btn.disabled=false);
    document.querySelector(".reset-btn").remove();
  }
}




// ===== ラウンド処理（累積スコア更新版） =====
let lastLoggedRound = 0; // 最後にログを出したラウンド番号

//スタート画面
const startScreen = document.getElementById("start-screen");
const gameArea = document.getElementById("game-area");

document.getElementById("cpu-btn").addEventListener("click", () => {
  startScreen.style.display = "none";
  gameArea.style.display = "block";
  // CPU戦モードフラグ
  window.isOnline = false;

  resetGame(false);
  console.log("対CPU")
});


async function joinRoom(selectedRoomId) {
  // もし前の onSnapshot があれば解除
  if (unsubscribe) unsubscribe();

  roomId = selectedRoomId;
  window.isOnline = true;

  await checkAndInitRoom();
  await assignPlayer();

  // onSnapshot を roomId に合わせて設定
  const gameRef = doc(db, "games", roomId);
  unsubscribe = onSnapshot(gameRef, (docSnap) => {
    const data = docSnap.data();
    if (!data) return;

    console.log(roomId);

    const p = data.player1;
    const c = data.player2;

    // 両プレイヤーが手を出したら
    if (p.left !== null && p.right !== null && c.left !== null && c.right !== null) {

      

      const pResult = judgeLeft(p.left, c.left);
      const cResult = -pResult;

      let pGain = calcScore(pResult, p.right, c.right, onlinePBlockCount, onlineEndGame);
      let cGain = calcScore(cResult, c.right, p.right, c.blockCount, onlineEndGame);

      // カウンター処理
      if (c.right === 3) { cGain = pGain; pGain = 0; }
      if (p.right === 3) { pGain = cGain; cGain = 0; }

      // ブロック／リバーサル処理
      if (p.right === 0) onlinePBlockCount++;
      if (p.right === 5) onlinePReversal = true;


      updateDoc(doc(db, "games", roomId), {
        "player1.score": (p.score || 0) + pGain,
        "player2.score": (c.score || 0) + cGain,
        "round": data.round + 1,
        "player1.left": null,
        "player1.right": null,
        "player2.left": null,
        "player2.right": null
      });

      // --- ログ表示 ---
      if (lastLoggedRound < data.round) { // まだログ出してないラウンド
        const logEl = document.getElementById("log");
        
        // 最初の案内を消す
        if (data.round === 0) logEl.textContent = '';

        if (playerId === "player1") {
          logEl.textContent += `\nラウンド ${data.round} 結果:\n` +
                              `あなた：${handName(p.left)} / ${rightName(p.right)} (${format(pGain)})\n` +
                              `相手：${handName(c.left)} / ${rightName(c.right)} (${format(cGain)})\n`;
        } else {
          logEl.textContent += `\nラウンド ${data.round} 結果:\n` +
                              `あなた：${handName(c.left)} / ${rightName(c.right)} (${format(cGain)})\n` +
                              `相手：${handName(p.left)} / ${rightName(p.right)} (${format(pGain)})\n`;
        }

        logEl.scrollTop = logEl.scrollHeight;
        document.querySelectorAll(".hands button").forEach(btn => btn.classList.remove("selected"));
        lastLoggedRound = data.round; // 更新
      }

      // スコア・ラウンド更新
      document.getElementById("round").textContent = data.round + 1;

      if (playerId === "player1")
      {
        document.getElementById("pScore").textContent = (p.score || 0) + pGain;
        document.getElementById("cScore").textContent = (c.score || 0) + cGain;
      }
      else
      {
        document.getElementById("pScore").textContent = (c.score || 0) + cGain;
        document.getElementById("cScore").textContent = (p.score || 0) + pGain;
      }

      if (data.round + 1 > maxRound) {
        endGameOnline((p.score || 0) + pGain, (c.score || 0) + cGain);
      }
    }
    
  });

  console.log(selectedRoomId + " に参加しました");
}

document.getElementById("online-btn-room001").addEventListener("click", async () => {
  if (playerCount.room001 < 2) {
    await joinRoom("room001"); // Firestore初期化・onSnapshot設定など
    startScreen.style.display = "none";
    gameArea.style.display = "block";
  }
});

document.getElementById("online-btn-room002").addEventListener("click", async () => {
  if (playerCount.room002 < 2) {
    await joinRoom("room002"); // Firestore初期化・onSnapshot設定など
    startScreen.style.display = "none";
    gameArea.style.display = "block";
  }
});

document.getElementById("online-btn-room003").addEventListener("click", async () => {
  if (playerCount.room003 < 2) {
    await joinRoom("room003"); // Firestore初期化・onSnapshot設定など
    startScreen.style.display = "none";
    gameArea.style.display = "block";
  }
});

// ルームごとのプレイヤー人数を保存するオブジェクト
const playerCount = {}; // 空オブジェクトで初期化



roomIds.forEach(roomId => {
  const roomRef = doc(db, "games", roomId);

  onSnapshot(roomRef, (docSnap) => {
    const data = docSnap.data();
    if (!data) return;

    // ルームごとの人数をオブジェクトに保存
    playerCount[roomId] = 
      (data.player1?.join ? 1 : 0) +
      (data.player2?.join ? 1 : 0);

    // ボタンの表示を更新
    const btn = document.getElementById(`online-btn-${roomId}`);
    if (btn) btn.textContent = `${roomId} ${playerCount[roomId]}/2`;

    console.log(playerCount); // 確認用
  });
});





document.getElementById("return-start").addEventListener("click", async () => {
  if (window.isOnline && playerId && roomId) {
    // オンライン退出状態を更新
    const gameRef = doc(db, "games", roomId);
    await updateDoc(gameRef, { [`${playerId}.join`]: false });

    const resetBtn = document.querySelector(".reset-btn"); // クラス名で取得
    if (resetBtn) {
      resetBtn.remove();
}
  }

  // ゲームUI非表示、スタート画面表示
  document.getElementById("game-area").style.display = "none";
  document.getElementById("start-screen").style.display = "flex";
});


// ===rating===
async function getRateOrDefault(uid) {
  if (!uid) return 1500; // UIDがない場合
  const rateDoc = doc(db, "ratings", uid);
  const snapshot = await getDoc(rateDoc);
  if (!snapshot.exists()) {
    // ドキュメントが無ければ作って初期値1500
    await setDoc(rateDoc, { rate: 1500 });
    return 1500;
  }
  return snapshot.data().rate || 1500;
}

async function updateRateAfterMatch(uidA, uidB, scoreA, scoreB) {
  const rateA = await getRateOrDefault(uidA);
  const rateB = await getRateOrDefault(uidB);

  let S_A = scoreA > scoreB ? 1 : scoreA < scoreB ? 0 : 0.5;
  let S_B = scoreB > scoreA ? 1 : scoreB < scoreA ? 0 : 0.5;

  const K = 32;
  const E_A = 1 / (1 + 10 ** ((rateB - rateA)/400));
  const E_B = 1 / (1 + 10 ** ((rateA - rateB)/400));

  if(uidA) await updateDoc(doc(db, "ratings", uidA), { rate: Math.round(rateA + K*(S_A-E_A)) });
  if(uidB) await updateDoc(doc(db, "ratings", uidB), { rate: Math.round(rateB + K*(S_B-E_B)) });
}

async function updateRateDisplay(myUID, oppUID = null) {
  const myRate = await getRateOrDefault(myUID);
  document.getElementById("my-rate").textContent = myRate;

  if (oppUID) {
    const oppRate = await getRateOrDefault(oppUID);
    document.getElementById("opp-rate").textContent = oppRate;
    document.getElementById("opp-rate-container").style.display = "inline";
  } else {
    document.getElementById("opp-rate-container").style.display = "none";
  }
}

//ルール
const ruleText = document.getElementById("rule-text");
const toggleBtn = document.getElementById("toggle-text");

// 表示/非表示切り替え
toggleBtn.addEventListener("click", () => {
  const isHidden = window.getComputedStyle(ruleText).display === "none";
  if(isHidden){
    ruleText.style.display = "block";
  } else {
    ruleText.style.display = "none";
  }
});