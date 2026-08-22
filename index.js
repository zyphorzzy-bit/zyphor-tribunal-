const { 
  Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, 
  ButtonStyle, EmbedBuilder, ChannelType, SlashCommandBuilder, REST, Routes, 
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ModalBuilder, TextInputBuilder, 
  TextInputStyle, ActivityType, AttachmentBuilder 
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
  img: "", thumb: "", targetChannelId: "", logChannelId: "", roleJuiz: "",
  superiorRoles: [], roleAdv1: "", roleAdv2: "", roleAdv3: "", atendimentoAtivo: true
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

// Anti-travamento
client.on(Events.ThreadDelete, (thread) => {
  for (const userId in db.userTickets) {
    if (db.userTickets[userId] === thread.id) { 
      delete db.userTickets[userId]; 
      delete db.tickets[thread.id]; 
      salvarDB(); 
    }
  }
});

async function encerrarTicket(channel, encarregadoId) {
  const t = db.tickets[channel.id];
  if (!t) return;

  channel.send(`${E.fechar} Gerando logs e encerrando o julgamento...`);

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const logText = messages.reverse().map(m => `[${m.createdAt.toLocaleString('pt-BR')}] ${m.author.tag}: ${m.content}`).join('\n');
    const buffer = Buffer.from(logText, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `log-${channel.name}.txt` });

    if (config.logChannelId) {
      const logChan = await client.channels.fetch(config.logChannelId).catch(() => null);
      if (logChan) {
        const embLog = new EmbedBuilder()
          .setTitle(`${E.tribunal} LOG DE ENCERRAMENTO`)
          .setDescription(`**Tópico:** ${channel.name}\n**Autor:** <@${t.dono}>\n**Encerrado por:** <@${encarregadoId}>`)
          .setColor(0x2b2d31);
        await logChan.send({ embeds: [embLog], files: [attachment] });
      }
    }
  } catch (e) {
    console.error("Erro ao gerar logs:", e);
  }

  delete db.userTickets[t.dono];
  delete db.tickets[channel.id];
  salvarDB();

  setTimeout(() => channel.delete().catch(() => {}), 2000);
}

// --- COMANDOS DE TEXTO ---
client.on(Events.MessageCreate, async m => {
  if (!m.content.startsWith('.') || m.author.bot) return;
  const args = m.content.slice(1).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  if (cmd === 'f' && db.tickets[m.channel.id]) {
    return encerrarTicket(m.channel, m.author.id);
  }

  if (cmd === 'atendimento' && OWNER_IDS.includes(m.author.id)) {
    const sub = args[0]?.toLowerCase();
    if (sub === 'on') {
      config.atendimentoAtivo = true;
      salvarCfg();
      return m.reply('✅ Atendimento **ATIVADO**!');
    }
    if (sub === 'off') {
      config.atendimentoAtivo = false;
      salvarCfg();
      return m.reply('🔒 Atendimento **DESATIVADO**!');
    }
  }

  if (cmd === 'unadv') {
    const isOwner = OWNER_IDS.includes(m.author.id);
    const isSuperior = m.member.roles.cache.some(r => config.superiorRoles.includes(r.id));
    if (!isOwner && !isSuperior) return;

    const targetMember = m.mentions.members.first();
    if (!targetMember) return m.reply('Mencione o juiz para remover a ADV.');

    if (db.judgeAdvs[targetMember.id] && db.judgeAdvs[targetMember.id].length > 0) {
      const count = db.judgeAdvs[targetMember.id].length;
      
      if (count === 1 && config.roleAdv1) targetMember.roles.remove(config.roleAdv1).catch(() => {});
      if (count === 2 && config.roleAdv2) targetMember.roles.remove(config.roleAdv2).catch(() => {});
      if (count >= 3 && config.roleAdv3) targetMember.roles.remove(config.roleAdv3).catch(() => {});

      db.judgeAdvs[targetMember.id].pop();
      salvarDB();
      return m.reply(`✅ 1 ADV removida do juiz <@${targetMember.id}>. Restantes: ${db.judgeAdvs[targetMember.id].length}`);
    } else {
      return m.reply('Este juiz não possui advertências.');
    }
  }
});

// --- INTERAÇÕES SLASH & PAINEL ---
client.on(Events.InteractionCreate, async int => {
  if (int.isChatInputCommand()) {
    if (int.commandName === 'config') {
      if (!OWNER_IDS.includes(int.user.id)) return int.reply({ content: `${E.proibido} Apenas donos.`, ephemeral: true });

      const embedCfg = new EmbedBuilder().setTitle(`${E.tribunal} Painel de Configuração`).setDescription("Gerencie os cargos e canais do bot abaixo:").setColor(0x2b2d31);
      
      const rowBtns = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg_texts').setLabel('Editar Textos/Mídia').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg_view').setLabel('Ver Configurações').setStyle(ButtonStyle.Secondary)
      );
      const rowTarget = new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('cfg_target_chan').setPlaceholder('Canal onde os Tickets serão criados'));
      const rowLog = new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('cfg_log_chan').setPlaceholder('Canal de LOGS dos Tickets'));
      const rowRoleJuiz = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_role_juiz').setPlaceholder('Cargo Oficial dos JUIZES'));
      const rowRoles = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_superiors').setPlaceholder('Cargos Superiores (ADV / Suporte)').setMinValues(1).setMaxValues(3));

      return int.reply({ embeds: [embedCfg], components: [rowBtns, rowTarget, rowLog, rowRoleJuiz, rowRoles], ephemeral: true });
    }

    if (int.commandName === 'enviar') {
      if (!OWNER_IDS.includes(int.user.id)) return int.reply({ content: `${E.proibido} Apenas donos.`, ephemeral: true });

      const targetChan = config.targetChannelId ? await client.channels.fetch(config.targetChannelId).catch(() => null) : int.channel;
      const embed = new EmbedBuilder().setTitle(`${E.tribunal} ${config.title}`).setDescription(config.desc).setImage(config.img || null).setThumbnail(config.thumb || null).setColor(0x2b2d31);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('abrir_ticket').setLabel('Solicitar Julgamento').setEmoji(E.juiz).setStyle(ButtonStyle.Secondary));

      await targetChan.send({ embeds: [embed], components: [row] });
      return int.reply({ content: `✅ Painel enviado em <#${targetChan.id}>!`, ephemeral: true });
    }

    if (int.commandName === 'adv_juiz') {
      const isOwner = OWNER_IDS.includes(int.user.id);
      const isSuperior = int.member.roles.cache.some(r => config.superiorRoles.includes(r.id));
      if (!isOwner && !isSuperior) return int.reply({ content: `${E.proibido} Sem permissão.`, ephemeral: true });

      const targetUser = int.options.getUser('juiz');
      const targetMember = await int.guild.members.fetch(targetUser.id).catch(() => null);
      const motivo = int.options.getString('motivo');

      if (!db.judgeAdvs[targetUser.id]) db.judgeAdvs[targetUser.id] = [];
      db.judgeAdvs[targetUser.id].push({ motivo, aplicadoPor: int.user.id, data: new Date().toLocaleDateString('pt-BR') });
      salvarDB();

      const count = db.judgeAdvs[targetUser.id].length;
      const warnEmoji = count === 1 ? E.warn1 : count === 2 ? E.warn2 : E.warn3;

      if (targetMember) {
        if (count === 1 && config.roleAdv1) targetMember.roles.add(config.roleAdv1).catch(() => {});
        if (count === 2 && config.roleAdv2) targetMember.roles.add(config.roleAdv2).catch(() => {});
        if (count >= 3 && config.roleAdv3) targetMember.roles.add(config.roleAdv3).catch(() => {});
      }

      const emb = new EmbedBuilder()
        .setTitle(`${warnEmoji} ADVERTÊNCIA APLICADA`)
        .setDescription(`**Juiz/Staff:** <@${targetUser.id}>\n**Quantidade:** ${count}/3\n**Motivo:** ${motivo}\n**Aplicado por:** <@${int.user.id}>`)
        .setColor(0x2b2d31);

      return int.reply({ embeds: [emb] });
    }
  }

  // --- MODAL E SELECT MENUS DE CONFIG ---
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
    return int.reply({ content: '✅ Salvo!', ephemeral: true });
  }

  if (int.isButton() && int.customId === 'cfg_view') {
    const rolesText = config.superiorRoles.length ? config.superiorRoles.map(r => `<@&${r}>`).join(', ') : 'Nenhum';
    const juizText = config.roleJuiz ? `<@&${config.roleJuiz}>` : 'Não configurado';
    const chanText = config.targetChannelId ? `<#${config.targetChannelId}>` : 'Canal Atual';
    const logText = config.logChannelId ? `<#${config.logChannelId}>` : 'Nenhum';

    return int.reply({ content: `**Configurações:**\n• **Cargo Juiz:** ${juizText}\n• **Canal Tickets:** ${chanText}\n• **Canal Logs:** ${logText}\n• **Superiores/Suporte:** ${rolesText}`, ephemeral: true });
  }

  if (int.isChannelSelectMenu()) {
    if (int.customId === 'cfg_target_chan') config.targetChannelId = int.values[0];
    if (int.customId === 'cfg_log_chan') config.logChannelId = int.values[0];
    salvarCfg();
    return int.reply({ content: `✅ Canal atualizado!`, ephemeral: true });
  }

  if (int.isRoleSelectMenu()) {
    if (int.customId === 'cfg_role_juiz') config.roleJuiz = int.values[0];
    if (int.customId === 'cfg_superiors') config.superiorRoles = int.values;
    salvarCfg();
    return int.reply({ content: `✅ Cargo atualizado!`, ephemeral: true });
  }

  // --- BOTÃO DE ABRIR TICKET ---
  if (int.isButton() && int.customId === 'abrir_ticket') {
    if (!config.atendimentoAtivo) return int.reply({ content: `${E.proibido} Os atendimentos estão fechados no momento!`, ephemeral: true });
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

    // Adiciona o usuário no tópico
    await thread.members.add(int.user.id).catch(() => {});

    const embTicket = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`${E.tribunal} AUDIÊNCIA SOLICITADA`)
      .setDescription(`**Autor:** <@${int.user.id}>\n**Status:** 🔴 Não Atendido\n\nAguarde um Juiz assumir a sessão.`)
      .setFooter({ text: "Sistema de Tribunal | Atendimento" });

    const btns = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('assumir_ticket').setLabel('Assumir').setEmoji(E.atender).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar').setEmoji(E.fechar).setStyle(ButtonStyle.Secondary)
    );

    const pingJuiz = config.roleJuiz ? `<@&${config.roleJuiz}>` : '';
    await thread.send({ content: `<@${int.user.id}> ${pingJuiz}`, embeds: [embTicket], components: [btns] });
    return int.editReply({ content: `✅ Julgamento aberto: ${thread}` });
  }

  // --- BOTÕES DENTRO DO TICKET ---
  if (int.isButton()) {
    const t = db.tickets[int.channel.id];

    if (int.customId === 'assumir_ticket') {
      if (!t) return;
      if (t.atendido) return int.reply({ content: `${E.proibido} Este ticket já foi assumido por outro juiz!`, ephemeral: true });

      t.atendido = true;
      t.juizId = int.user.id;
      salvarDB();

      // Adiciona o juiz atual no tópico privado
      await int.channel.members.add(int.user.id).catch(() => {});

      const embUpdate = EmbedBuilder.from(int.message.embeds[0])
        .setDescription(`**Autor:** <@${t.dono}>\n**Status:** 🟢 Atendido por <@${int.user.id}>\n\n${E.juiz} Sessão privada em andamento.`);

      const rowFechar = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar').setEmoji(E.fechar).setStyle(ButtonStyle.Secondary)
      );

      await int.message.edit({ embeds: [embUpdate], components: [rowFechar] });
      await int.channel.send({ content: `${E.juiz} <@${t.dono}>, o juiz <@${int.user.id}> está atendendo você e assumiu o seu julgamento!` });
      return int.reply({ content: `${E.atender} Você assumiu a sessão com exclusividade!`, ephemeral: true });
    }

    if (int.customId === 'fechar_ticket') {
      return encerrarTicket(int.channel, int.user.id);
    }
  }
});

client.login(process.env.DISCORD_TOKEN || process.env.TOKEN);
