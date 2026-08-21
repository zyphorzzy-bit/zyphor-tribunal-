const { 
  Client, 
  GatewayIntentBits, 
  Events, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  ChannelType, 
  PermissionsBitField, 
  AttachmentBuilder, 
  ActivityType 
} = require('discord.js');
require('dotenv').config();
const fs = require('fs');

const OWNER_IDS = ['1527769881326522478', '1533306874513068093'];
const DONOS = new Set(OWNER_IDS);

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

let config = fs.existsSync('./config.json') ? JSON.parse(fs.readFileSync('./config.json')) : {};
let db = fs.existsSync('./database.json') ? JSON.parse(fs.readFileSync('./database.json')) : {};

const salvarCfg = () => fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
const salvarDB = () => fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));

const padrao = {
  atendimentoAtivo: true,
  logChannelId: '',
  cargosJuiz: [],
  roleAdv1: '',
  roleAdv2: '',
  roleAdv3: ''
};
Object.entries(padrao).forEach(([k, v]) => { if (config[k] === undefined) config[k] = v; });
salvarCfg();

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ] 
});

const eStaff = m => DONOS.has(m.id) || (config.cargosJuiz && config.cargosJuiz.some(r => m.roles.cache.has(r)));

async function enviarLogFechamento(guild, channel, ticketData, fechadoPor) {
  if (!config.logChannelId) return;
  const logChannel = guild.channels.cache.get(config.logChannelId);
  if (!logChannel) return;

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    let logContent = `=== REGISTRO DE AUDIÊNCIA DO TRIBUNAL ===\n`;
    logContent += `ID do Ticket: ${channel.id}\n`;
    logContent += `Dono do Ticket: ${ticketData.dono}\n`;
    logContent += `Atendido por: ${ticketData.assumidoPor || 'Ninguém (Não foi assumido)'}\n`;
    logContent += `Fechado por: ${fechadoPor.tag} (${fechadoPor.id})\n`;
    logContent += `Data de Abertura: ${new Date(ticketData.criadoEm).toLocaleString('pt-BR')}\n`;
    logContent += `Data de Fechamento: ${new Date().toLocaleString('pt-BR')}\n`;
    logContent += `===========================================\n\n`;

    messages.reverse().forEach(msg => {
      logContent += `[${new Date(msg.createdAt).toLocaleString('pt-BR')}] ${msg.author.tag} (${msg.author.id}): ${msg.content}\n`;
    });

    const buffer = Buffer.from(logContent, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `log-${channel.name}.txt` });

    const embLog = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`${E.tribunal} CASO ENCERRADO - LOG`)
      .addFields(
        { name: '👤 Autor do Ticket', value: `<@${ticketData.dono}> (\`${ticketData.dono}\`)`, inline: true },
        { name: `${E.juiz} Atendido por`, value: ticketData.assumidoPor ? `<@${ticketData.assumidoPor}>` : 'Nenhum Juiz', inline: true },
        { name: `${E.fechar} Fechado por`, value: `<@${fechadoPor.id}>`, inline: true }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embLog], files: [attachment] });
  } catch (err) {
    console.error('Erro ao enviar log:', err);
  }
}

client.on('ready', () => {
  console.log(`Bot Tribunal Online: ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: 'ATENDENDO JULGAMENTOS', type: ActivityType.Streaming, url: 'https://twitch.tv/discord' }],
    status: 'online'
  });
});

client.on(Events.InteractionCreate, async int => {
  if (int.isButton()) {
    db.userTickets = db.userTickets || {};
    db.tickets = db.tickets || {};
    db.advs = db.advs || {};

    if (int.customId === 'abrir_julgamento') {
      if (!config.atendimentoAtivo) {
        return int.reply({ content: `${E.proibido} O atendimento do Tribunal está desativado!`, ephemeral: true });
      }

      const userAdv = db.advs[int.user.id]?.nivel || 0;
      if (userAdv >= 3) {
        return int.reply({ content: `${E.warn3} Você possui ADV 3 e está proibido de abrir novas solicitações!`, ephemeral: true });
      }

      if (db.userTickets[int.user.id]) {
        return int.reply({ content: `${E.proibido} Você já possui um julgamento aberto: <#${db.userTickets[int.user.id]}>`, ephemeral: true });
      }

      await int.deferReply({ ephemeral: true });

      const thread = await int.channel.threads.create({
        name: `⚖️-julgamento-${int.user.username}`,
        type: ChannelType.PrivateThread,
        invitable: false,
        autoArchiveDuration: 1440
      });

      db.tickets[thread.id] = { id: thread.id, dono: int.user.id, assumidoPor: null, criadoEm: Date.now() };
      db.userTickets[int.user.id] = thread.id;
      salvarDB();

      let advTxt = 'Nenhuma advertência cadastrada.';
      if (userAdv === 1) advTxt = `${E.warn1} **ADV 1** - Motivo: ${db.advs[int.user.id].motivo}`;
      if (userAdv === 2) advTxt = `${E.warn2} **ADV 2** - Motivo: ${db.advs[int.user.id].motivo}`;

      const emb = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(`${E.tribunal} SOLICITAÇÃO DE JULGAMENTO`)
        .setDescription(`**Autor:** <@${int.user.id}>\n**Status de Advertências:**\n${advTxt}\n\nAguarde um Juiz assumir o seu caso.`);

      const btns = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('assumir_julgamento').setLabel('Assumir').setEmoji(E.atender).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('fechar_julgamento').setLabel('Fechar').setEmoji(E.fechar).setStyle(ButtonStyle.Secondary)
      );

      const pingsJuizes = config.cargosJuiz.map(r => `<@&${r}>`).join(' ');
      await thread.send({ content: `<@${int.user.id}> ${pingsJuizes}`, embeds: [emb], components: [btns] });

      return int.editReply({ content: `${E.tribunal} Julgamento iniciado com sucesso: ${thread}` });
    }

    if (int.customId === 'assumir_julgamento') {
      if (!eStaff(int.member)) {
        return int.reply({ content: `${E.proibido} Apenas Juízes autorizados podem assumir casos!`, ephemeral: true });
      }

      const t = db.tickets[int.channel.id];
      if (t) {
        t.assumidoPor = int.user.id;
        salvarDB();
      }

      const members = await int.channel.members.fetch();
      for (const [id] of members) {
        if (id !== int.user.id && id !== t?.dono && id !== client.user.id) {
          await int.channel.members.remove(id).catch(() => {});
        }
      }

      const apenasFechar = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fechar_julgamento').setLabel('Fechar').setEmoji(E.fechar).setStyle(ButtonStyle.Secondary)
      );

      await int.message.edit({ components: [apenasFechar] });
      return int.reply({ content: `${E.juiz} O Juiz <@${int.user.id}> assumiu este julgamento!` });
    }

    if (int.customId === 'fechar_julgamento') {
      const t = db.tickets[int.channel.id];
      if (!t || (!eStaff(int.member) && t.dono !== int.user.id)) {
        return int.reply({ content: `${E.proibido} Sem permissão para encerrar este julgamento!`, ephemeral: true });
      }

      await int.reply(`${E.fechar} Gerando logs e encerrando o chamado...`);

      await enviarLogFechamento(int.guild, int.channel, t, int.user);

      delete db.tickets[int.channel.id];
      delete db.userTickets[t.dono];
      salvarDB();

      setTimeout(() => int.channel.delete().catch(() => {}), 2000);
    }
  }
});

client.on(Events.MessageCreate, async m => {
  if (!m.guild || m.author.bot) return;

  const args = m.content.trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  if (['.f', '.fechar'].includes(cmd)) {
    const t = db.tickets[m.channel.id];
    if (t && (eStaff(m.member) || t.dono === m.author.id)) {
      await m.reply(`${E.fechar} Gerando logs e encerrando o chamado...`);
      
      await enviarLogFechamento(m.guild, m.channel, t, m.author);

      delete db.tickets[m.channel.id];
      delete db.userTickets[t.dono];
      salvarDB();

      return setTimeout(() => m.channel.delete().catch(() => {}), 2000);
    }
  }

  if (cmd === '!setlogs') {
    if (!eStaff(m.member)) return;
    const c = m.mentions.channels.first() || m.guild.channels.cache.get(args[0]);
    if (c) {
      config.logChannelId = c.id;
      salvarCfg();
      return m.reply(`${E.tribunal} Canal de logs configurado com sucesso para ${c}!`);
    }
  }

  if (cmd === '.atendimento') {
    if (!eStaff(m.member)) return;
    const opt = args[0]?.toLowerCase();
    if (opt === 'off') {
      config.atendimentoAtivo = false;
      salvarCfg();
      return m.reply(`${E.proibido} Atendimento do Tribunal **DESATIVADO**.`);
    } else if (opt === 'on') {
      config.atendimentoAtivo = true;
      salvarCfg();
      return m.reply(`${E.tribunal} Atendimento do Tribunal **ATIVADO**.`);
    }
  }

  if (['.adv1', '.adv2', '.adv3'].includes(cmd)) {
    if (!eStaff(m.member)) return;
    const alvo = m.mentions.members.first();
    const motivo = args.slice(1).join(' ') || 'Sem motivo especificado';

    if (!alvo) return m.reply(`${E.proibido} Mencione o usuário. Ex: \`${cmd} @user Motivo\``);

    db.advs = db.advs || {};
    const nivel = parseInt(cmd.replace('.adv', ''));

    db.advs[alvo.id] = { nivel, motivo, aplicadoPor: m.author.id, data: Date.now() };
    salvarDB();

    const roleMap = { 1: config.roleAdv1, 2: config.roleAdv2, 3: config.roleAdv3 };
    if (roleMap[nivel]) await alvo.roles.add(roleMap[nivel]).catch(() => {});

    const emojiAdv = nivel === 1 ? E.warn1 : nivel === 2 ? E.warn2 : E.warn3;
    return m.reply(`${emojiAdv} O usuário ${alvo} recebeu **ADV ${nivel}**!\n**Motivo:** ${motivo}`);
  }
});

// Suporta tanto DISCORD_TOKEN quanto TOKEN no Railway
client.login(process.env.DISCORD_TOKEN || process.env.TOKEN);
