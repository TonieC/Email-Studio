'use strict';

function lines(text) {
  return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

function diff(a, b) {
  const left = lines(a);
  const right = lines(b);
  const n = left.length;
  const m = right.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hunks = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      hunks.push({ type: 'equal', left: left[i], right: right[j], line: i + 1 });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      hunks.push({ type: 'del', left: left[i], right: '', line: i + 1 });
      i += 1;
    } else {
      hunks.push({ type: 'add', left: '', right: right[j], line: j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    hunks.push({ type: 'del', left: left[i], right: '', line: i + 1 });
    i += 1;
  }
  while (j < m) {
    hunks.push({ type: 'add', left: '', right: right[j], line: j + 1 });
    j += 1;
  }
  return hunks.filter((h) => h.type !== 'equal' || hunks.length < 400).slice(0, 2000);
}

module.exports = { diff };
