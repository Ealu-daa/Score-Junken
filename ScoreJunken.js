/* =========================
   Score Junken Core Logic - 最強CPU対応
   ========================= */

// 左手
const HAND = { ROCK:0, SCISSORS:1, PAPER:2 };

// 右手
const RIGHT = { LIGHT:1, DRIVE:2, COUNTER:3 };

// =========================
// 勝敗判定
// return: 1=勝ち, 0=あいこ, -1=負け
// =========================
function judgeLeft(player, opponent){
  if(player===opponent) return 0;
  if((player+1)%3===opponent) return 1;
  return -1;
}

// =========================
// スコア計算
// =========================
function calcScore(leftResult, selfRight, oppRight){
  if(selfRight===RIGHT.LIGHT) return (leftResult===1||leftResult===0)?1:0;
  if(selfRight===RIGHT.DRIVE) return (leftResult===1)?2:0;
  if(selfRight===RIGHT.COUNTER){
    if(leftResult===1) return -1;
    if(leftResult===0) return 0;
    if(leftResult===-1){
      if(oppRight===RIGHT.DRIVE) return 3;
      if(oppRight===RIGHT.LIGHT) return 2;
      return 2;
    }
  }
  return 0;
}

// =========================
// 最強CPUロジック
// =========================

// 左手：プレイヤー傾向読み
function cpuLeft(playerHistory){
  if(!playerHistory.length) return Math.floor(Math.random()*3);
  const counts=[0,0,0];
  for(const h of playerHistory) counts[h.left]++;
  const maxIndex = counts.indexOf(Math.max(...counts));
  return (maxIndex+1)%3; // 勝てる手
}

// 右手：スコア依存
function cpuRight(playerHistory, cpuLeftChoice){
  const last = playerHistory.at(-1);
  let leftResult = last ? judgeLeft(cpuLeftChoice, last.left) : null;

  if(cpuScore >= playerScore){
    // CPU勝ち → 安全運転
    return Math.random()<0.7 ? RIGHT.LIGHT : RIGHT.DRIVE;
  } else {
    // CPU負け → 攻撃的
    if(leftResult===1) return RIGHT.DRIVE;
    if(leftResult===0) return RIGHT.LIGHT;
    if(leftResult===-1){
      return last && last.right===RIGHT.DRIVE ? RIGHT.COUNTER : RIGHT.DRIVE;
    }
  }
  return RIGHT.LIGHT;
}

// =========================
// ゲーム状態
// =========================
let playerScore = 0;
let cpuScore = 0;
let history = [];
let round = 1;
const maxRound = 10;
let selectedLeft = null;
let selectedRight = null;

// =========================
// 1ターン進行
// =========================
function playTurn(playerLeft, playerRight){
  const cpuL = cpuLeft(history);
  const cpuR = cpuRight(history, cpuL);

  const pResult = judgeLeft(playerLeft, cpuL);
  const cResult = -pResult;

  const pGain = calcScore(pResult, playerRight, cpuR);
  const cGain = calcScore(cResult, cpuR, playerRight);

  playerScore += pGain;
  cpuScore += cGain;

  history.push({left:playerLeft,right:playerRight});

  return {
    player:{left:playerLeft,right:playerRight,gain:pGain},
    cpu:{left:cpuL,right:cpuR,gain:cGain},
    score:{player:playerScore,cpu:cpuScore}
  };
}

// =========================
// UI補助
// =========================
function handName(v){ return ["グー","チョキ","パー"][v]; }
function rightName(v){ return {1:"ライト",2:"ドライブ",3:"カウンター"}[v]; }
function format(n){ return n>0?"+"+n:n.toString(); }

function highlight(groupSelector,index){
  document.querySelectorAll(groupSelector).forEach((btn,i)=>{
    btn.classList.toggle("selected",i===index);
  });
}

// =========================
// ゲーム進行
// =========================
function tryPlay(){
  if(selectedLeft===null||selectedRight===null) return;

  const result = playTurn(selectedLeft,selectedRight);

  document.getElementById("pScore").textContent = result.score.player;
  document.getElementById("cScore").textContent = result.score.cpu;

  // ログに追記＆自動スクロール
  const logEl = document.getElementById("log");
  logEl.textContent += `ラウンド ${round} 結果:\nあなた：${handName(result.player.left)} / ${rightName(result.player.right)} (${format(result.player.gain)})\nCPU：${handName(result.cpu.left)} / ${rightName(result.cpu.right)} (${format(result.cpu.gain)})\n\n`;
  logEl.scrollTop = logEl.scrollHeight;

  document.getElementById("round").textContent = round;

  round++;
  if(round>maxRound){ endGame(); return; }

  selectedLeft=null;
  selectedRight=null;
  document.querySelectorAll(".hands button").forEach(btn=>btn.classList.remove("selected"));
}

// =========================
// 左右手選択
// =========================
function selectLeft(v){ selectedLeft=v; highlight(".hand.left .hands button",v); tryPlay(); }
function selectRight(v){ selectedRight=v; highlight(".hand.right .hands button",v-1); tryPlay(); }

// =========================
// ゲーム終了
// =========================
function endGame(){
  let winner;
  if(playerScore>cpuScore) winner="あなたの勝ち！🎉";
  else if(playerScore<cpuScore) winner="CPUの勝ち！💻";
  else winner="引き分け！🤝";

  const logEl = document.getElementById("log");
  logEl.textContent += `=== ゲーム終了 ===\n${winner}\n`;
  logEl.scrollTop = logEl.scrollHeight;

  document.querySelectorAll(".hands button").forEach(btn=>btn.disabled=true);

  // リセットボタン追加
  const resetBtn = document.createElement("button");
  resetBtn.textContent="もう一度プレイ";
  resetBtn.classList.add("reset-btn");
  resetBtn.onclick=resetGame;
  document.body.appendChild(resetBtn);
}

// =========================
// ゲームリセット
// =========================
function resetGame(){
  round=1;
  playerScore=0;
  cpuScore=0;
  history=[];
  selectedLeft=null;
  selectedRight=null;

  document.getElementById("pScore").textContent=0;
  document.getElementById("cScore").textContent=0;
  document.getElementById("round").textContent=1;
  document.getElementById("log").textContent="左手と右手を選んでください";

  document.querySelectorAll(".hands button").forEach(btn=>btn.disabled=false);
  document.querySelector(".reset-btn").remove();
}
