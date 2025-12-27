/* =========================
   Score Junken Core Logic
   ========================= */

window.addEventListener("load", () => {
  console.log("ver0.1.6");
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
  getDoc
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
const maxRound = 10;

import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const auth = getAuth();
const provider = new GoogleAuthProvider();

document.getElementById("google-login").addEventListener("click", () => {
  signInWithRedirect(auth, provider); // ポップアップではなくリダイレクト
});

window.addEventListener("load", async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      const user = result.user;
      console.log("ログイン成功", user.uid, user.displayName);
      window.currentUID = user.uid;
      // 必要ならUI更新
      document.getElementById("google-login").textContent = `こんにちは、${user.displayName}`;
    }
  } catch (error) {
    console.error("ログイン失敗", error);
  }
});

/*
async function getRate(uid) {
  const rateDoc = doc(db, "ratings", uid);
  const snapshot = await getDoc(rateDoc);
  if (!snapshot.exists()) {
    await setDoc(rateDoc, { rate: 1500 }); // 初期レート
    return 1500;
  }
  return snapshot.data().rate;
}
*/

// ===== 左手・右手 定義 =====
const HAND = { ROCK:0, SCISSORS:1, PAPER:2 };
const RIGHT = { LIGHT:1, DRIVE:2, COUNTER:3 };

// ===== 勝敗判定 (左手) =====
function judgeLeft(player, opponent){
  if(player === opponent) return 0;
  return ((player + 1) % 3 === opponent) ? 1 : -1;
}

// ===== スコア計算 (右手) =====
function calcScore(leftResult, selfRight, oppRight){
  if(leftResult === 0 && selfRight === oppRight)
    return 0;
  if(selfRight === RIGHT.LIGHT) 
    return (leftResult >= 0 ? 1 : 0);
  if(selfRight === RIGHT.DRIVE) 
    return (leftResult === 1 ? 2 : 0);
  if(selfRight === RIGHT.COUNTER){
    if(leftResult === 1) return -1;
    if(leftResult === 0) return 0;
    if(leftResult === -1){
      if(oppRight === RIGHT.DRIVE) return 3;
      if(oppRight === RIGHT.LIGHT) return 2;
      return 2;
    }
  }
  return 0;
}

// ===== CPUロジック =====
// 左手: プレイヤー傾向読み
function cpuLeft(playerHistory){
  if(!playerHistory.length) return Math.floor(Math.random()*3);
  const counts = [0,0,0];
  for(const h of playerHistory) counts[h.left]++;
  const maxIndex = counts.indexOf(Math.max(...counts));
  return (maxIndex+1)%3;
}

// 右手: スコア依存
function cpuRight(playerHistory, cpuLeftChoice){
  const last = playerHistory.at(-1);
  const leftResult = last ? judgeLeft(cpuLeftChoice, last.left) : null;

  if(cpuScore >= playerScore){
    // CPU勝ち → 安全運転
    return Math.random()<0.7 ? RIGHT.LIGHT : RIGHT.DRIVE;
  } else {
    // CPU負け → 攻撃的
    if(leftResult === 1) return RIGHT.DRIVE;
    if(leftResult === 0) return RIGHT.LIGHT;
    if(leftResult === -1) return last && last.right === RIGHT.DRIVE ? RIGHT.COUNTER : RIGHT.DRIVE;
  }
  return RIGHT.LIGHT;
}

// ===== ゲーム状態 =====
let playerScore = 0;
let cpuScore = 0;
let history = [];
let round = 1;
let selectedLeft = null;
let selectedRight = null;

// ===== ルーム初期化（存在しなければ作る） =====
async function checkAndInitRoom() {
  const gameRef = doc(db, "games", roomId);
  const docSnap = await getDoc(gameRef);

  if (!docSnap.exists()) {
    // まだ部屋がなければ新規作成
    await setDoc(gameRef, {
      player1: { join: false, left: null, right: null, score: 0 },
      player2: { join: false, left: null, right: null, score: 0 },
      round: 1,
      status: "playing"
    });
    console.log("新規ルーム作成");
    return;
  }

  const data = docSnap.data() || {};

  // 誰もいなければ初期化
  const p1Empty = !data.player1?.join;
  const p2Empty = !data.player2?.join;

  if (p1Empty && p2Empty) {
    await setDoc(gameRef, {
      player1: { join: false, left: null, right: null, score: 0 },
      player2: { join: false, left: null, right: null, score: 0 },
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
}

const gameRef = doc(db, "games", roomId);

onSnapshot(gameRef, (docSnap) => {
  const data = docSnap.data();
  if (!data) return;

  // 自分の playerId に応じて相手UIDを更新
  if (playerId === "player1") {
    window.opponentUID = data.player2?.uid || null;
  } else if (playerId === "player2") {
    window.opponentUID = data.player1?.uid || null;
  }

  // ここで左下レート表示を更新
  //updateRateDisplay(window.currentUID, window.opponentUID);
});

// ===== 手の選択 =====
window.chooseHand = async function(handType, value) {
  if (!playerId && window.isOnline) return alert("プレイヤーが未割り当てです");

  // ボタンハイライト
  if(handType === "left") {
    selectedLeft = value;
    highlight(".hands:nth-of-type(1) button", value);
  } else if(handType === "right") {
    selectedRight = value;
    highlight(".hands:nth-of-type(2) button", value - 1); // rightは1からスタートしてるので-1
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
      const result = playTurn(selectedLeft, selectedRight);
      updateGameUI(result);
      // 選択状態リセット
      selectedLeft = null;
      selectedRight = null;
      document.querySelectorAll(".hands button").forEach(btn => btn.classList.remove("selected"));
    }
  }
}

// ===== 1ターン進行 =====
function playTurn(playerLeft, playerRight){
  const cpuL = cpuLeft(history);
  const cpuR = cpuRight(history, cpuL);

  const pResult = judgeLeft(playerLeft, cpuL);
  const cResult = -pResult;

  const pGain = calcScore(pResult, playerRight, cpuR);
  const cGain = calcScore(cResult, cpuR, playerRight);

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
function rightName(v){ return {1:"ライト",2:"ドライブ",3:"カウンター"}[v]; }
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

function endGameOnline(pScore, cScore) {
  /*
  if(window.currentUID && window.opponentUID){
  updateRateAfterMatch(window.currentUID, window.opponentUID,
    (p.score || 0) + pGain, (c.score || 0) + cGain);
  updateRateDisplay(window.currentUID, window.opponentUID);
  }
  */
  

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
function resetGame(){
  round = 1;
  playerScore = 0;
  cpuScore = 0;
  history = [];
  selectedLeft = null;
  selectedRight = null;

  document.getElementById("pScore").textContent = 0;
  document.getElementById("cScore").textContent = 0;
  document.getElementById("round").textContent = 1;
  document.getElementById("log").textContent = "左手と右手を選んでください";

  document.querySelectorAll(".hands button").forEach(btn => btn.disabled=false);
  document.querySelector(".reset-btn").remove();
}

// ===== ラウンド処理（累積スコア更新版） =====
onSnapshot(doc(db, "games", roomId), (docSnap) => {
  const data = docSnap.data();
  if (!data) return;

  const p = data.player1;
  const c = data.player2;

  // 両プレイヤーが手を出したらラウンド処理
  if (p.left !== null && p.right !== null && c.left !== null && c.right !== null) {
    // 勝敗判定
    const pResult = judgeLeft(p.left, c.left);
    const cResult = -pResult;

    const pGain = calcScore(pResult, p.right, c.right);
    const cGain = calcScore(cResult, c.right, p.right);

    // Firestore に累積加算で更新
    updateDoc(doc(db, "games", roomId), {
      "player1.score": (p.score || 0) + pGain,
      "player2.score": (c.score || 0) + cGain,
      "round": data.round + 1,
      "player1.left": null,
      "player1.right": null,
      "player2.left": null,
      "player2.right": null
    });

    // UI更新
    const logEl = document.getElementById("log");
    logEl.textContent += `ラウンド ${data.round} 結果:\n` +
                         `あなた：${handName(p.left)} / ${rightName(p.right)} (${format(pGain)})\n` +
                         `相手：${handName(c.left)} / ${rightName(c.right)} (${format(cGain)})\n\n`;
    logEl.scrollTop = logEl.scrollHeight;

    document.getElementById("round").textContent = data.round + 1;
    document.getElementById("pScore").textContent = (p.score || 0) + pGain;
    document.getElementById("cScore").textContent = (c.score || 0) + cGain;

    if (data.round + 1 > maxRound) {
      endGameOnline((p.score || 0) + pGain, (c.score || 0) + cGain);
    }
  }
});

window.addEventListener("beforeunload", async (event) => {
  if (!playerId) return;
  if (window.isOnline === false) return;

  const gameRef = doc(db, "games", roomId);

  try {
    // 非同期処理ですが、ブラウザ終了時に完全に反映される保証はありません
    await updateDoc(gameRef, {
      [`${playerId}.join`]: false
    });
    console.log(`${playerId} が退出しました`);
  } catch (err) {
    console.error("退出時の更新に失敗", err);
  }
});

//スタート画面
const startScreen = document.getElementById("start-screen");
const gameArea = document.getElementById("game-area");

document.getElementById("cpu-btn").addEventListener("click", () => {
  startScreen.style.display = "none";
  gameArea.style.display = "block";
  // CPU戦モードフラグ
  window.isOnline = false;

  resetGame();
  console.log("対CPU")
});

document.getElementById("online-btn-room001").addEventListener("click", async () => {
  if (playerCount.room001 < 2)
  {
    startScreen.style.display = "none";
    gameArea.style.display = "block";
    // オンライン戦モードフラグ
    roomId = "room001"
    window.isOnline = true;

    await checkAndInitRoom();
    await assignPlayer();
    //await updateRateDisplay(window.currentUID, window.opponentUID);
    console.log("対人")
  }
});

document.getElementById("online-btn-room002").addEventListener("click", async () => {
  if(playerCount.room002 < 2)
  {
  startScreen.style.display = "none";
  gameArea.style.display = "block";
  // オンライン戦モードフラグ
  roomId = "room002"
  window.isOnline = true;
  //await updateRateDisplay(window.currentUID, window.opponentUID);

  await checkAndInitRoom();
  await assignPlayer();
  console.log("対人")
  }
});

// ルームごとのプレイヤー人数を保存するオブジェクト
const playerCount = {}; // 空オブジェクトで初期化

const roomIds = ["room001", "room002"];

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

//rating
/*
async function getRateOrDefault(uid) {
  if (!uid) return 1500; // UID自体が null/undefined なら 1500
  const rateDoc = doc(db, "ratings", uid);
  const snapshot = await getDoc(rateDoc);
  if (!snapshot.exists()) {
    // ドキュメントがなければ作って 1500
    await setDoc(rateDoc, { rate: 1500 });
    return 1500;
  }
  return snapshot.data().rate || 1500; // rate が undefined の場合も 1500
}

getRate();

async function updateRateAfterMatch(uidA, uidB, scoreA, scoreB) {
  const rateA = await getRateOrDefault(uidA);
  const rateB = await getRateOrDefault(uidB);

  let S_A, S_B;
  if(scoreA > scoreB) { S_A = 1; S_B = 0; }
  else if(scoreA < scoreB) { S_A = 0; S_B = 1; }
  else { S_A = 0.5; S_B = 0.5; }

  const K = 32;
  const E_A = 1 / (1 + 10 ** ((rateB - rateA)/400));
  const E_B = 1 / (1 + 10 ** ((rateA - rateB)/400));

  if(uidA) await updateDoc(doc(db, "ratings", uidA), { rate: Math.round(rateA + K*(S_A-E_A)) });
  if(uidB) await updateDoc(doc(db, "ratings", uidB), { rate: Math.round(rateB + K*(S_B-E_B)) });
}

async function updateRateDisplay(myUID, oppUID = null) {
  // 自分のレート取得
  const myRate = await getRateOrDefault(myUID);
  document.getElementById("my-rate").textContent = myRate;

  if(oppUID) {
    // 相手UIDがあれば表示
    const oppRate = await getRateOrDefault(oppUID);
    document.getElementById("opp-rate").textContent = oppRate;
    document.getElementById("opp-rate-container").style.display = "inline";
  } else {
    // CPU戦やオフライン戦なら非表示
    document.getElementById("opp-rate-container").style.display = "none";
  }
}

await updateRateDisplay(window.currentUID);
*/