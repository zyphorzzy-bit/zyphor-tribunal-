const { 
  Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, 
  ButtonStyle, EmbedBuilder, ChannelType, SlashCommandBuilder, REST, Routes, 
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActivityType 
} = require('discord.js');
require('dotenv').config();
const fs = require('fs');

const OWNER_IDS = ['1527769881326522478', '1533306874513068093'];

const E = { 
  tribunal: '<:tribunal:1540467698826481735>', 
  juiz: '<:juiz:1540467697501077605>', 
  proibido: '<:Proibido:1540467080422498409>', 
  atender: '<:atender:1540467077385683076>', 
  fechar: '<:fechar:1540467078753026048>',
  warn1: '<:warn1:1540096479501357137>',
  warn2: '<:warn2:1540096480998596741>',
  warn3: '<:warn3:1540096477689290842>'
};

let config = fs.existsSync('./config.json') ? JSON.parse(fs.readFileSync('./config.json')) : { 
  title: "Julgamento Tribunal", 
  desc: "• Tem algum caso para recorrer?\n\n↪ Solicite um julgamento e aguarde atendimento.", 
  img: "", thumb: "", targetChannelId: "", logChannelId: "",
  superiorRoles: [] 
};
let db = fs.existsSync('./database.json') ? JSON.parse(fs.readFileSync('./database.json')) : { tickets: {}, userTickets: {}, judgeAdvs: {} };

const salvarCfg = () => fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
const salvarDB = () => fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });

const commands = [
  new SlashCommandBuilder().setName('config').setDescription('Abre o painel interativo de configuração'),
  new SlashCommandBuilder().setName('enviar').setDescription('Envia o painel no canal configurado'),
  new SlashCommandBuilder().setName('adv_juiz').setDescription('Aplica ADV em um Juiz/Staff')
    .addUserOption(o => o.setName('juiz').setDescription('Juiz a ser advertido').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo da advertência').setRequired(true))
];

client.on('ready', async () => {
  client.user.setPresence({
    activities: [{ name: 'ATENDENDO JULGAMENTOS', type: ActivityType.Streaming, url: 'https://twitch.tv/discord' }],
    status: 'online'
  });
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log(`Bot Tribunal Online: ${client.user.tag}`);
});

// Anti-travamento de tópicos
client.on(Events.ThreadDelete, (thread) => {
  for (const userId in db.userTickets) {
    if (db.userTickets[userId] === thread.id) { 
      delete db.userTickets[userId]; 
      delete db.tickets[thread.id]; 
      salvarDB(); 
    }
  }
});

client.on(Events.InteractionCreate, async int => {
  // --- COMANDOS SLASH ---
  if (int.isChatInputCommand()) {
    if (int.commandName === 'config') {
      if (!OWNER_IDS.includes(int.user.id)) return int.reply({ content: `${E.proibido} Apenas donos.`, ephemeral: true });

      const embedCfg = new EmbedBuilder()
        .setTitle(`${E.tribunal} Painel de Configuração`)
        .setDescription("Gerencie todas as opções do bot usando os botões e menus abaixo:")
        .setColor(0x2b2d31);

      const rowBtns = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg_texts').setLabel('Editar Textos/Mídia').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg_view').setLabel('Ver Configurações').setStyle(ButtonStyle.Secondary)
      );

      const rowChan = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId('cfg_target_chan').setPlaceholder('Canal onde os Tópicos/Tickets serão criados')
      );

      const rowRoles = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId('cfg_superiors').setPlaceholder('Cargos Superiores (Podem dar ADV nos Juízes)').setMinValues(1).setMaxValues(3)
      );

      return int.reply({ embeds: [embedCfg], components: [rowBtns, rowChan, rowRoles], ephemeral: true });
    }

    if (int.commandName === 'enviar') {
      if (!OWNER_IDS.includes(int.user.id)) return int.reply({ content: `${E.proibido} Apenas donos.`, ephemeral: true });

      const targetChan = config.targetChannelId ? await client.channels.fetch(config.targetChannelId).catch(() => null) : int.channel;
      
      const embed = new EmbedBuilder()
        .setTitle(`${E.tribunal} ${config.title}`)
        .setDescription(config.desc)
        .setImage(config.img || null)
        .setThumbnail(config.thumb || null)
        .setColor(0x2b2d31);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('abrir_ticket').setLabel('Solicitar Julgamento').setEmoji(E.juiz).setStyle(ButtonStyle.Secondary)
      );

      await targetChan.send({ embeds: [embed], components: [row] });
      return int.reply({ content: `✅ Painel enviado em <#${targetChan.id}>!`, ephemeral: true });
    }

    if (int.commandName === 'adv_juiz') {
      const isOwner = OWNER_IDS.includes(int.user.id);
      const isSuperior = int.member.roles.cache.some(r => config.superiorRoles.includes(r.id));

      if (!isOwner && !isSuperior) {
        return int.reply({ content: `${E.proibido} Você não tem permissão para aplicar ADV em juízes.`, ephemeral: true });
      }

      const target = int.options.getUser('juiz');
      const motivo = int.options.getString('motivo');

      if (!db.judgeAdvs[target.id]) db.judgeAdvs[target.id] = [];
      db.judgeAdvs[target.id].push({ motivo, aplicadoPor: int.user.id, data: new Date().toLocaleDateString('pt-BR') });
      salvarDB();

      const count = db.judgeAdvs[target.id].length;
      const warnEmoji = count === 1 ? E.warn1 : count === 2 ? E.warn2 : E.warn3;

      const emb = new EmbedBuilder()
        .setTitle(`${warnEmoji} ADVERTÊNCIA APLICADA`)
        .setDescription(`**Juiz/Staff:** <@${target.id}>\n**Quantidade:** ${count}/3\n**Motivo:** ${motivo}\n**Aplicado por:** <@${int.user.id}>`)
        .setColor(0x2b2d31);

      return int.reply({ embeds: [emb] });
    }
  }

  // --- INTERAÇÃO DO PAINEL DE CONFIG (BOTÕES / MENUS) ---
  if (int.isButton() && int.customId === 'cfg_texts') {
    const modal = new ModalBuilder().setCustomId('modal_cfg_texts').setTitle('Configurar Painel');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_title').setLabel('Título').setStyle(TextInputStyle.Short).setValue(config.title)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(config.desc)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_img').setLabel('URL Banner/Imagem').setStyle(TextInputStyle.Short).setValue(config.img).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_thumb').setLabel('URL Thumbnail').setStyle(TextInputStyle.Short).setValue(config.thumb).setRequired(false))
    );
    return int.showModal(modal);
  }

  if (int.isModalSubmit() && int.customId === 'modal_cfg_texts') {
    config.title = int.fields.getTextInputValue('t_title');
    config.desc = int.fields.getTextInputValue('t_desc');
    config.img = int.fields.getTextInputValue('t_img');
    config.thumb = int.fields.getTextInputValue('t_thumb');
    salvarCfg();
    return int.reply({ content: '✅ Textos e mídias salvos!', ephemeral: true });
  }

  if (int.isButton() && int.customId === 'cfg_view') {
    const rolesText = config.superiorRoles.length ? config.superiorRoles.map(r => `<@&${r}>`).join(', ') : 'Nenhum';
    const chanText = config.targetChannelId ? `<#${config.targetChannelId}>` : 'Canal Atual';
    return int.reply({ content: `**Configurações Atuais:**\n• **Canal:** ${chanText}\n• **Cargos Superiores:** ${rolesText}`, ephemeral: true });
  }

  if (int.isChannelSelectMenu() && int.customId === 'cfg_target_chan') {
    config.targetChannelId = int.values[0];
    salvarCfg();
    return int.reply({ content: `✅ Canal de tickets definido para <#${config.targetChannelId}>`, ephemeral: true });
  }

  if (int.isRoleSelectMenu() && int.customId === 'cfg_superiors') {
    config.superiorRoles = int.values;
    salvarCfg();
    return int.reply({ content: `✅ Cargos Superiores atualizados!`, ephemeral: true });
  }

  // --- SISTEMA DE TICKETS ---
  if (int.isButton() && int.customId === 'abrir_ticket') {
    if (db.userTickets[int.user.id]) return int.reply({ content: `${E.proibido} Você já possui um atendimento aberto.`, ephemeral: true });

    await int.deferReply({ ephemeral: true });

    const targetChannel = config.targetChannelId ? await client.channels.fetch(config.targetChannelId).catch(() => int.channel) : int.channel;

    const thread = await targetChannel.threads.create({
      name: `⚖️-julgamento-${int.user.username}`,
      type: ChannelType.PrivateThread,
      invitable: false
    });

    db.userTickets[int.user.id] = thread.id;
    db.tickets[thread.id] = { dono: int.user.id, atendido: false };
    salvarDB();

    const embTicket = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`${E.tribunal} AUDIÊNCIA SOLICITADA`)
      .setDescription(`**Autor:** <@${int.user.id}>\n**Status:** 🔴 Não Atendido\n\nAguarde um Juiz assumir a sessão.`)
      .setFooter({ text: "Sistema de Tribunal | Atendimento" });

    const btns = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('assumir_ticket').setLabel('Assumir').setEmoji(E.atender).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar').setEmoji(E.fechar).setStyle(ButtonStyle.Secondary)
    );

    await thread.send({ content: `<@${int.user.id}>`, embeds: [embTicket], components: [btns] });
    return int.editReply({ content: `✅ Julgamento aberto: ${thread}` });
  }

  if (int.isButton()) {
    const t = db.tickets[int.channel.id];

    if (int.customId === 'assumir_ticket') {
      if (!t) return;
      t.atendido = true;
      salvarDB();

      const embUpdate = EmbedBuilder.from(int.message.embeds[0])
        .setDescription(`**Autor:** <@${t.dono}>\n**Status:** 🟢 Atendido por <@${int.user.id}>\n\n${E.juiz} Sessão sob responsabilidade da staff.`);

      const rowFechar = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar').setEmoji(E.fechar).setStyle(ButtonStyle.Secondary)
      );

      await int.message.edit({ embeds: [embUpdate], components: [rowFechar] });
      return int.reply({ content: `${E.atender} Você assumiu o ticket.` });
    }

    if (int.customId === 'fechar_ticket') {
      int.reply(`${E.fechar} Encerrando...`);
      if (t) delete db.userTickets[t.dono];
      delete db.tickets[int.channel.id];
      salvarDB();
      setTimeout(() => int.channel.delete().catch(() => {}), 2000);
    }
  }
});

client.login(process.env.DISCORD_TOKEN || process.env.TOKEN);
