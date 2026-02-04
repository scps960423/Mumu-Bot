// utils/auth.js
const HELPER_ROLE_ID = process.env.HELPER_ROLE_ID; // 開團小幫手 ID
const ARCHON_ROLE_ID = process.env.ARCHON_ROLE_ID; // 執政官 ID

module.exports = {
  /**
   * 檢查成員是否具備管理權限 (執政官或小幫手)
   */
  hasAdminPermission: (member) => {
    if (!HELPER_ROLE_ID && !ARCHON_ROLE_ID) return true; // 若未設定變數則預設開放
    return member.roles.cache.has(HELPER_ROLE_ID) || member.roles.cache.has(ARCHON_ROLE_ID);
  }
};