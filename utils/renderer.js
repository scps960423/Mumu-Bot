module.exports = {
  /**
   * 根據名單與自訂人數上限渲染報名表內容
   */
  renderRaidDescription: (raiders, maxPlayers = 8) => {
    // 1. 先區分「手動選候補」與「正常職業」的人
    const manualWait = raiders.filter(r => r.job === '⏳ [候補]');
    const activeRaiders = raiders.filter(r => r.job !== '⏳ [候補]');

    // 2. 根據 maxPlayers 動態切割正取與自動候補
    const mainTeam = activeRaiders.slice(0, maxPlayers);
    const autoWait = activeRaiders.slice(maxPlayers);

    // 3. 合併所有候補成員（自動 + 手動）
    const totalWaiting = [...autoWait, ...manualWait];

    let text = `**【 正取名單 】**\n`;
    if (mainTeam.length > 0) {
      text += mainTeam.map((r, i) => `${i + 1}. ${r.job} **${r.name}**`).join('\n');
    } else {
      text += '尚未有人報名...(´;ω;`)';
    }

    if (totalWaiting.length > 0) {
      text += `\n\n**━━ 候補名單 ━━**\n`;
      text += totalWaiting.map((r, i) => `(候補 ${i + 1}) ${r.job} ${r.name}`).join('\n');
    }

    return { text, mainCount: mainTeam.length, waitCount: totalWaiting.length };
  }
};