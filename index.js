require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder
} = require('discord.js');

// 報名表單渲染工具
const { renderRaidDescription } = require('./utils/renderer');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 儲存開團數據：結構為 { msgId: { members: [], maxPlayers: 8 } }
let raidData = {};

// --- 1. 指令規格 ---
const commands = [
  new SlashCommandBuilder()
    .setName('開團')
    .setDescription('暮暮幫您發起布本報名✨')
    .addStringOption(option =>
      option.setName('時間')
        .setDescription('預計開團的時間 (例如: 2/15 21:00)')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('人數')
        .setDescription('正取人數 (預設為 8)')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('代報')
    .setDescription('幫夥伴登記報名')
    .addStringOption(option => option.setName('對象').setDescription('對象名稱').setRequired(true))
    .addStringOption(option => option.setName('職業').setDescription('選擇職業').setRequired(true)
      .addChoices(
        { name: '🛡️ 坦', value: '🛡️ [坦]' },
        { name: '🌿 補', value: '🌿 [補]' },
        { name: '⚔️ 打', value: '⚔️ [打]' },
        { name: '😎 學習', value: '😎 [學習]' },
        { name: '⏳ 候補', value: '⏳ [候補]' }
      ))
].map(command => command.toJSON());

// --- 2. 註冊與上線 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ 暮暮指令同步成功！');
  } catch (error) {
    console.error('❌ 指令同步失敗:', error);
  }
})();

// 修正過時警告：改用 clientReady
client.once('clientReady', (c) => {
  console.log(`✅ 機器人 ${c.user.tag} 已上線！`);
});

// --- 3. 核心更新函數 (修復資料存取邏輯) ---
async function updateRaidEmbed(interaction) {
  const msgId = interaction.message.id;
  const raid = raidData[msgId];

  if (!raid) return;

  const raidTime = interaction.message.embeds[0].fields[0].value;
  // 調用 renderer 並傳入自訂人數上限
  const { text, mainCount, waitCount } = renderRaidDescription(raid.members, raid.maxPlayers);

  const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setFields(
      { name: '📅 開團時間', value: raidTime, inline: false },
      { name: '👥 正取人數', value: `\`${mainCount} / ${raid.maxPlayers}\``, inline: true },
      { name: '⏳ 候補人數', value: `\`${waitCount}\``, inline: true }
    )
    .setDescription(text);

  await interaction.update({ embeds: [newEmbed] });
}

// --- 4. 處理互動 ---
client.on('interactionCreate', async (interaction) => {

  // A. 斜線指令處理：嚴格使用 return 防止流程繼續向下執行 (解決 40060 錯誤)
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === '開團') {
      const raidTime = interaction.options.getString('時間');
      const maxPlayers = interaction.options.getInteger('人數') || 8;

      const embed = new EmbedBuilder()
        .setTitle('🌙 布本挑戰 ( • ̀ω•́ )')
        .addFields(
          { name: '📅 開團時間', value: `**${raidTime}**`, inline: false },
          { name: '👥 正取人數', value: `\`0 / ${maxPlayers}\``, inline: true },
          { name: '⏳ 候補人數', value: '`0`', inline: true }
        )
        .setDescription('**【 正取名單 】**\n尚未有人報名...(´;ω;`)')
        .setColor(0x00AE86)
        .setTimestamp();

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join_melee').setLabel('🛡️坦').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('join_range').setLabel('🌿補').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('join_support').setLabel('⚔️打').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('join_learning').setLabel('😎學習').setStyle(ButtonStyle.Secondary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join_wait').setLabel('⏳ 我先候補').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('leave_raid').setLabel('❌ 取消報名').setStyle(ButtonStyle.Secondary)
      );

      // 回覆並標註 @everyone
      return await interaction.reply({
        content: `@everyone\n## 喵嗚～各位夥伴請注意！暮暮已經把報名表準備好了✨\n### 本次正取名額為 **${maxPlayers}** 位，快點擊職業報名吧！`,
        embeds: [embed],
        components: [row1, row2],
        withResponse: true
      }).then(response => {
        // 儲存該次開團資料
        raidData[interaction.id] = { members: [], maxPlayers: maxPlayers };
      });
    }

    if (interaction.commandName === '代報') {
      const lastMsgId = Object.keys(raidData).reverse()[0];
      if (!lastMsgId) return interaction.reply({ content: '找不到開團！', ephemeral: true });

      const targetName = interaction.options.getString('對象');
      const targetJob = interaction.options.getString('職業');
      const raid = raidData[lastMsgId];

      if (raid.members.some(r => r.name.includes(targetName))) {
        return interaction.reply({ content: `**${targetName}** 已經在名單中囉！`, ephemeral: true });
      }

      raid.members.push({ name: `(代) ${targetName}`, job: targetJob });

      try {
        const message = await interaction.channel.messages.fetch(lastMsgId);
        const { text, mainCount, waitCount } = renderRaidDescription(raid.members, raid.maxPlayers);

        const newEmbed = EmbedBuilder.from(message.embeds[0])
          .setFields(
            { name: '📅 開團時間', value: message.embeds[0].fields[0].value, inline: false },
            { name: '👥 正取人數', value: `\`${mainCount} / ${raid.maxPlayers}\``, inline: true },
            { name: '⏳ 候補人數', value: `\`${waitCount}\``, inline: true }
          )
          .setDescription(text);

        await message.edit({ embeds: [newEmbed] });
        return interaction.reply({ content: `✅ 已幫 **${targetName}** 完成登記！`, ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: '代報完成，但畫面更新失敗。', ephemeral: true });
      }
    }
    return;
  }

  // B. 按鈕互動處理
  if (interaction.isButton()) {
    const msgId = interaction.message.id;

    // 數據存取兼容邏輯
    if (!raidData[msgId]) {
      const initKey = Object.keys(raidData).find(key => raidData[key].members.length === 0);
      if (initKey) {
        raidData[msgId] = raidData[initKey];
        delete raidData[initKey];
      } else {
        raidData[msgId] = { members: [], maxPlayers: 8 };
      }
    }

    const raid = raidData[msgId];
    const userName = interaction.user.globalName || interaction.user.username;

    if (interaction.customId.startsWith('join_')) {
      if (raid.members.some(r => r.name === userName)) {
        return interaction.reply({ content: '妳已經在名單中囉！', ephemeral: true });
      }

      let jobEmoji = '';
      let isManualWait = false;
      if (interaction.customId === 'join_melee') jobEmoji = '🛡️ [坦]';
      if (interaction.customId === 'join_range') jobEmoji = '🌿 [補]';
      if (interaction.customId === 'join_support') jobEmoji = '⚔️ [打]';
      if (interaction.customId === 'join_learning') jobEmoji = '😎 [學習]';
      if (interaction.customId === 'join_wait') { jobEmoji = '⏳ [候補]'; isManualWait = true; }

      raid.members.push({ name: userName, job: jobEmoji });
      await updateRaidEmbed(interaction);

      const activeCount = raid.members.filter(r => r.job !== '⏳ [候補]').length;
      if (isManualWait || activeCount > raid.maxPlayers) {
        return interaction.followUp({ content: '🌌 **暮暮：** 已幫您排入候補名單囉！', ephemeral: true });
      }
      return;
    }

    if (interaction.customId === 'leave_raid') {
      const index = raid.members.findIndex(r => r.name === userName);
      if (index === -1) return interaction.reply({ content: '沒找到妳的名單喵！', ephemeral: true });

      raid.members.splice(index, 1);
      await updateRaidEmbed(interaction);
      return interaction.followUp({ content: '暮暮幫你完成取消囉！', ephemeral: true });
    }
  }
});

client.login(TOKEN);