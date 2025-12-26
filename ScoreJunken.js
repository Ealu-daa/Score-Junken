/* =========================
   Score Junken Core Logic
   ========================= */

// 左手
const HAND = {
  ROCK: 0,    // グー
  SCISSORS: 1, // チョキ
  PAPER: 2    // パー
};

// 右手
const RIGHT = {
  LIGHT: 1,     // +1
  DRIVE: 2,     // +2（勝ち）
  COUNTER: 3    // 受け専用
};

// =========================
// 勝敗判定
// return: 1=勝ち, 0=あいこ, -1=負け
// =========================
function judgeLeft(player, opponent) {
  if (player === opponent) return 0;
  if ((player + 1) % 3 === opponent) return 1;
  return -1;
}

// =========================
// スコア計算
// =========================
function calcScore(leftResult, selfRight, oppRight) {

  // ライト(勝ちorあいこ)
  if (selfRight === RIGHT.LIGHT) {
    return leftResult === 1 || leftResult === 0 ? 1 : 0;
  }

  // ドライブ（右手=2）(勝ちのみ)
  if (selfRight === RIGHT.DRIVE) {
    return leftResult === 1 ? 2 : 0;
  }

  // カウンター（右手=3）
  if (selfRight === RIGHT.COUNTER) {
    if (leftResult === 1) return -1; // 勝ったら失敗
    if (leftResult === 0) return 0;  // あいこ

    // 負けた場合
    if (leftResult === -1) {
      if (oppRight === RIGHT.DRIVE) return 3;
      if (oppRight === RIGHT.LIGHT) return 2;
      return 2; // 相手もカウンター（暫定）
    }
  }

  return 0;
}

// =========================
// CPUロジック（Lv2）
// =========================
function cpuLeft(lastPlayerLeft) {
  if (lastPlayerLeft !== null && Math.random() < 0.4) {
    return (lastPlayerLeft + 1) % 3;
  }
  return Math.floor(Math.random() * 3);
}

function cpuRight(playerHistory) {
  if (playerHistory.length === 0) return RIGHT.LIGHT;

  let last = playerHistory.at(-1);

  // 相手がドライブ多め → カウンター
  if (last.right === RIGHT.DRIVE && Math.random() < 0.6) {
    return RIGHT.COUNTER;
  }

  // ライト連打 → ドライブ
  if (
    playerHistory.length >= 2 &&
    playerHistory.slice(-2).every(h => h.right === RIGHT.LIGHT)
  ) {
    return RIGHT.DRIVE;
  }

  // 通常
  return Math.random() < 0.7 ? RIGHT.LIGHT : RIGHT.DRIVE;
}

// =========================
// ゲーム状態
// =========================
let playerScore = 0;
let cpuScore = 0;
let history = [];

// =========================
// 1ターン進行
// =========================
function playTurn(playerLeft, playerRight) {
  const cpuL = cpuLeft(history.at(-1)?.left ?? null);
  const cpuR = cpuRight(history);

  const pResult = judgeLeft(playerLeft, cpuL);
  const cResult = -pResult;

  const pGain = calcScore(pResult, playerRight, cpuR);
  const cGain = calcScore(cResult, cpuR, playerRight);

  playerScore += pGain;
  cpuScore += cGain;

  history.push({
    left: playerLeft,
    right: playerRight
  });

  return {
    player: { left: playerLeft, right: playerRight, gain: pGain },
    cpu: { left: cpuL, right: cpuR, gain: cGain },
    score: { player: playerScore, cpu: cpuScore }
  };
}
