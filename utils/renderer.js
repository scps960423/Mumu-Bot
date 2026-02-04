// utils/renderer.js
module.exports = {
  /**
   * 根據名單渲染報名表內容
   */
  renderRaidDescription: (raiders) => {
    const manualWait = raiders.filter(r => r.job === '⏳ [候補]');
    const activeRaiders = raiders.filter(r => r.job !== '⏳ [候補]');

    const mainTeam = activeRaiders.slice(0, 8);
    const autoWait = activeRaiders.slice(8);
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