const { 
  Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, 
  ButtonStyle, EmbedBuilder, ChannelType, SlashCommandBuilder, REST, Routes, 
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ActivityType 
} = require('discord.js');
require('dotenv').config();
const fs = require('fs');

const OWNER_IDS = ['1527769881326522478', '1533306874513068093'];

// Emojis Mapeados
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
  desc: "• Tem algum caso que gostaria de recorrer?\n\n↪ Solicite um julgamento e aguarde, em breve um juiz irá assumir sua solicitação para analisar o caso.", 
  img: "", thumb: "", logChannelId: "", roleJuiz: "", roleA1: "", roleA2: "", roleA3: "" 
};
let db = fs.existsSync('./database.json') ? JSON.parse(fs.readFileSync('./database.json')) : { tickets: {}, userTickets: {} };

const salvar = () => { fs.writeFileSync('./config.json', JSON.stringify(config, null, 2)); fs.writeFileSync('./database.json', JSON.stringify(db, null, 2)); };

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });

const commands = [
  new SlashCommandBuilder().setName('config').setDescription('Configura os cargos, canais e textos do painel')
    .addStringOption(o => o.setName('titulo').setDescription('Título do painel'))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição do painel'))
    .addStringOption(o => o.setName('imagem').setDescription('URL do Banner (Imagem)'))
    .addStringOption(o => o.setName('thumbnail').setDescription('URL da Thumbnail')),
  new SlashCommandBuilder().setName('enviar').setDescription('Envia o painel de atendimento do Tribunal')
];

client.on('ready', async () => {
  // Transmissão / Stream
  client.user.setPresence({
    activities: [{ name: 'ATENDENDO JULGAMENTOS', type: ActivityType.Streaming, url: 'https://twitch.tv/discord' }],
    status: 'online'
  });

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log(`Bot Tribunal Online: ${client.user.tag}`);
});

// Anti-travamento (Libera se o tópico for excluído)
client.on(Events.ThreadDelete, (thread) => {
  for (const userId in db.userTickets) {
    if (db.userTickets[userId] === thread.id) { 
      delete db.userTickets[userId]; 
      delete db.tickets[thread.id]; 
      salvar(); 
    }
  }
});

client.on(Events.InteractionCreate, async int => {
  if (int.isChatInputCommand()) {
    if (!OWNER_IDS.includes(int.user.id)) return int.reply({ content: `${E.proibido} Apenas donos.`, ephemeral: true });

    if (int.commandName === 'config') {
      config.title = int.options.getString('titulo') || config.title;
      config.desc = int.options.getString('descricao') || config.desc;
      config.img = int.options.getString('imagem') || config.img;
      config.thumb = int.options.getString('thumbnail') || config.thumb;
      salvar();

      const rows = [
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('cfg_log').setPlaceholder('Selecionar Canal de Logs')),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_juiz').setPlaceholder('Selecionar Cargo de JUIZ')),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_a1').setPlaceholder('Selecionar Cargo ADV 1')),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_a2').setPlaceholder('Selecionar Cargo ADV 2')),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_a3').setPlaceholder('Selecionar Cargo ADV 3'))
      ];

      return int.reply({ content: `${E.tribunal} **Configurações salvas!** Escolha os canais e cargos abaixo se desejar:`, components: rows, ephemeral: true });
    }

    if (int.commandName === 'enviar') {
      const embed = new EmbedBuilder()
        .setTitle(`${E.tribunal} ${config.title}`)
        .setDescription(config.desc)
        .setImage(config.img || null)
        .setThumbnail(config.thumb || null)
        .setColor(0x2b2d31);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('abrir_ticket').setLabel('Solicitar Julgamento').setEmoji(E.juiz).setStyle(ButtonStyle.Secondary)
      );

      await int.channel.send({ embeds: [embed], components: [row] });
      return int.reply({ content: '✅ Painel enviado com sucesso!', ephemeral: true });
    }
  }

  // Salva seleções dos menus do /config
  if (int.isChannelSelectMenu() || int.isRoleSelectMenu()) {
    if (int.customId === 'cfg_log') config.logChannelId = int.values[0];
    if (int.customId === 'cfg_juiz') config.roleJuiz = int.values[0];
    if (int.customId === 'cfg_a1') config.roleA1 = int.values[0];
    if (int.customId === 'cfg_a2') config.roleA2 = int.values[0];
    if (int.customId === 'cfg_a3') config.roleA3 = int.values[0];
    salvar();
    return int.reply({ content: '✅ Alteração salva!', ephemeral: true });
  }

  // Abertura de Ticket
  if (int.isButton() && int.customId === 'abrir_ticket') {
    if (db.userTickets[int.user.id]) return int.reply({ content: `${E.proibido} Você já possui um atendimento aberto.`, ephemeral: true });

    await int.deferReply({ ephemeral: true });

    const thread = await int.channel.threads.create({
      name: `⚖️-julgamento-${int.user.username}`,
      type: ChannelType.PrivateThread,
      invitable: false
    });

    db.userTickets[int.user.id] = thread.id;
    db.tickets[thread.id] = { dono: int.user.id };
    salvar();

    const embTicket = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`${E.tribunal} AUDIÊNCIA SOLICITADA`)
      .setDescription(`**Autor:** <@${int.user.id}>\n\nO Tribunal recebeu o seu chamado. Aguarde um Juiz assumir a sessão.`)
      .setFooter({ text: "Sistema de Tribunal | Atendimento" });

    const btns = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('assumir_ticket').setLabel('Assumir').setEmoji(E.atender).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar').setEmoji(E.fechar).setStyle(ButtonStyle.Secondary)
    );

    const pingJuiz = config.roleJuiz ? `<@&${config.roleJuiz}>` : '';
    await thread.send({ content: `<@${int.user.id}> ${pingJuiz}`, embeds: [embTicket], components: [btns] });

    return int.editReply({ content: `✅ Julgamento aberto: ${thread}` });
  }

  // Ações dentro do Ticket
  if (int.isButton()) {
    const t = db.tickets[int.channel.id];

    if (int.customId === 'assumir_ticket') {
      if (!t) return;
      const embUpdate = EmbedBuilder.from(int.message.embeds[0])
        .setDescription(`**Autor:** <@${t.dono}>\n\n${E.juiz} **Juiz Responsável:** <@${int.user.id}>`);

      const rowFechar = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar').setEmoji(E.fechar).setStyle(ButtonStyle.Secondary)
      );

      await int.message.edit({ embeds: [embUpdate], components: [rowFechar] });
      return int.reply({ content: `${E.atender} Você assumiu esta sessão de julgamento.` });
    }

    if (int.customId === 'fechar_ticket') {
      int.reply(`${E.fechar} Encerrando a sessão...`);
      if (t) delete db.userTickets[t.dono];
      delete db.tickets[int.channel.id];
      salvar();
      setTimeout(() => int.channel.delete().catch(() => {}), 2000);
    }
  }
});

client.login(process.env.DISCORD_TOKEN || process.env.TOKEN);
