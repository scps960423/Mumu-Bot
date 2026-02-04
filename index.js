require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder
} = require('discord.js');

//報名表單內容
const { renderRaidDescription } = require('./utils/renderer');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let raidData = {};

// --- 1. 指令規格 ---
const commands = [
  new SlashCommandBuilder()
    .setName('開團')
    .setDescription('暮暮幫您發起布本報名✨')
    .addStringOption(option =>
      option.setName('時間')
        .setDescription('請輸入預計開團的時間 (例如: 2/15 21:00)')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('代報')
    .setDescription('幫夥伴登記報名')
    .addStringOption(option => option.setName('對象').setDescription('請輸入對方的名稱').setRequired(true))
    .addStringOption(option => option.setName('職業').setDescription('選擇職業').setRequired(true)
      .addChoices(
        { name: '🛡️ 坦', value: '🛡️ [坦]' },
        { name: '🌿 補', value: '🌿 [補]' },
        { name: '⚔️ 打', value: '⚔️ [打]' },
        { name: '😎 學習', value: '😎 [學習]' },
        { name: '⏳ 候補', value: '⏳ [候補]' }
      ))
].map(command => command.toJSON());

// --- 2. 註冊設定 ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('🔄 暮暮正在同步斜線指令...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ 指令同步成功！現在可以使用 /開團 了');
  } catch (error) {
    console.error('❌ 指令同步失敗:', error);
  }
})();

client.once('ready', () => {
  console.log(`✅ 機器人 ${client.user.tag} 已上線！`);
});



async function updateRaidEmbed(interaction, raiders) {
  const raidTime = interaction.message.embeds[0].fields[0].value;
  const { text, mainCount, waitCount } = renderRaidDescription(raiders);

  const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setFields(
      { name: '📅 開團時間', value: raidTime, inline: false },
      { name: '👥 正取人數', value: `\`${mainCount} / 8\``, inline: true },
      { name: '⏳ 候補人數', value: `\`${waitCount}\``, inline: true }
    )
    .setDescription(text);

  await interaction.update({ embeds: [newEmbed] });
}

// --- 4. 處理互動 ---
client.on('interactionCreate', async (interaction) => {
  // A. 斜線指令處理
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === '開團') {
      const raidTime = interaction.options.getString('時間');
      const embed = new EmbedBuilder()
        .setTitle('🌙 布本挑戰 ( • ̀ω•́ )')
        .addFields(
          { name: '📅 開團時間', value: `**${raidTime}**`, inline: false },
          { name: '👥 正取人數', value: '`0 / 8`', inline: true },
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
        // new ButtonBuilder().setCustomId('clear_raid').setLabel('♻️ 重置名單').setStyle(ButtonStyle.Danger)
      );

      const response = await interaction.reply({
        content: `## 喵嗚～各位夥伴請注意！暮暮已經把布本報名準備好了~請點擊要報名的職業✨`,
        embeds: [embed],
        components: [row1, row2],
        fetchReply: true
      });
      raidData[response.id] = [];
    }

    if (interaction.commandName === '代報') {
      const lastMsgId = Object.keys(raidData).reverse()[0];
      if (!lastMsgId) return interaction.reply({ content: '找不到進行中的開團！', ephemeral: true });

      const targetName = interaction.options.getString('對象');
      const targetJob = interaction.options.getString('職業');
      const currentRaiders = raidData[lastMsgId];

      if (currentRaiders.some(r => r.name.includes(targetName))) {
        return interaction.reply({ content: `**${targetName}** 已經在名單中囉！`, ephemeral: true });
      }

      currentRaiders.push({ name: `(代) ${targetName}`, job: targetJob });

      // 同步更新 Embed 畫面
      try {
        const message = await interaction.channel.messages.fetch(lastMsgId);
        const { text, mainCount, waitCount } = renderRaidDescription(currentRaiders);
        const newEmbed = EmbedBuilder.from(message.embeds[0])
          .setFields(
            { name: '📅 開團時間', value: message.embeds[0].fields[0].value, inline: false },
            { name: '👥 正取人數', value: `\`${mainCount} / 8\``, inline: true },
            { name: '⏳ 候補人數', value: `\`${waitCount}\``, inline: true }
          )
          .setDescription(text);

        await message.edit({ embeds: [newEmbed] });
        await interaction.reply({ content: `✅ 已幫 **${targetName}** 完成登記！`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: '代報成功，但無法自動更新訊息畫面。', ephemeral: true });
      }
    }
    return;
  }

  // B. 按鈕互動處理
  if (interaction.isButton()) {
    const msgId = interaction.message.id;
    if (!raidData[msgId]) raidData[msgId] = [];
    const currentRaiders = raidData[msgId];
    const userName = interaction.user.globalName || interaction.user.username;

    if (interaction.customId.startsWith('join_')) {
      if (currentRaiders.some(r => r.name === userName)) {
        return interaction.reply({ content: '妳已經在名單中囉！(#`Д´)ﾉ', ephemeral: true });
      }

      let jobEmoji = '';
      let isManualWait = false;

      if (interaction.customId === 'join_melee') jobEmoji = '🛡️ [坦]';
      if (interaction.customId === 'join_range') jobEmoji = '🌿 [補]';
      if (interaction.customId === 'join_support') jobEmoji = '⚔️ [打]';
      if (interaction.customId === 'join_learning') jobEmoji = '😎 [學習]';
      if (interaction.customId === 'join_wait') {
        jobEmoji = '⏳ [候補]';
        isManualWait = true;
      }

      currentRaiders.push({ name: userName, job: jobEmoji });
      await updateRaidEmbed(interaction, currentRaiders);

      if (isManualWait || (currentRaiders.filter(r => r.job !== '⏳ [候補]').length > 8)) {
        await interaction.followUp({ content: '🌌 **暮暮：** 已幫您排入候補名單囉！', ephemeral: true });
      }
    }

    if (interaction.customId === 'leave_raid') {
      const index = currentRaiders.findIndex(r => r.name === userName);
      if (index === -1) return interaction.reply({ content: '喵嗚？名單上沒找到妳耶！', ephemeral: true });

      currentRaiders.splice(index, 1);
      await updateRaidEmbed(interaction, currentRaiders);
      await interaction.followUp({ content: '暮暮幫你完成取消囉！', ephemeral: true });
    }

    // if (interaction.customId === 'clear_raid') {
    //   raidData[msgId] = [];
    //   const resetEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    //     .setFields(
    //       { name: '📅 開團時間', value: interaction.message.embeds[0].fields[0].value, inline: false },
    //       { name: '👥 正取人數', value: '`0 / 8`', inline: true },
    //       { name: '⏳ 候補人數', value: '`0`', inline: true }
    //     )
    //     .setDescription('**【 正取名單 】**\n尚未有人報名...(´;ω;`)');

    //   await interaction.update({ embeds: [resetEmbed] });
    //   await interaction.followUp({ content: '名單已清空，期待新的米列西安加入。', ephemeral: true });
    // }
  }
});

client.login(TOKEN);