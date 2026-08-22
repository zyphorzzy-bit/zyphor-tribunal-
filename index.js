const { Client, GatewayIntentBits, Events, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, SlashCommandBuilder, REST, Routes, RoleSelectMenuBuilder, ChannelSelectMenuBuilder } = require('discord.js');
require('dotenv').config();
const fs = require('fs');

const OWNER_IDS = ['1527769881326522478', '1533306874513068093'];
let config = fs.existsSync('./config.json') ? JSON.parse(fs.readFileSync('./config.json')) : { logs: "", roleJuiz: "", roleA1: "", roleA2: "", roleA3: "" };
const salvar = () => fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const commands = [
    new SlashCommandBuilder().setName('config').setDescription('Abre o painel de configuração visual'),
    new SlashCommandBuilder().setName('enviar').setDescription('Envia o painel de atendimento')
];

client.on('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`Bot Online!`);
});

client.on(Events.InteractionCreate, async int => {
    if (!OWNER_IDS.includes(int.user.id)) return;

    // --- PAINEL DE CONFIGURAÇÃO (VISUAL) ---
    if (int.isChatInputCommand() && int.commandName === 'config') {
        const rows = [
            new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('cfg_log').setPlaceholder('Selecionar Canal de Logs')),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_juiz').setPlaceholder('Selecionar Cargo de JUIZ')),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_a1').setPlaceholder('Selecionar Cargo ADV 1')),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_a2').setPlaceholder('Selecionar Cargo ADV 2')),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_a3').setPlaceholder('Selecionar Cargo ADV 3'))
        ];
        await int.reply({ content: '⚙️ **Painel de Configuração:** Clique para selecionar os itens', components: rows, ephemeral: true });
    }

    // --- SALVAR SELEÇÕES ---
    if (int.isChannelSelectMenu() || int.isRoleSelectMenu()) {
        if (int.customId === 'cfg_log') config.logs = int.values[0];
        if (int.customId === 'cfg_juiz') config.roleJuiz = int.values[0];
        if (int.customId === 'cfg_a1') config.roleA1 = int.values[0];
        if (int.customId === 'cfg_a2') config.roleA2 = int.values[0];
        if (int.customId === 'cfg_a3') config.roleA3 = int.values[0];
        salvar();
        int.reply({ content: `✅ Configuração salva com sucesso!`, ephemeral: true });
    }

    // --- ENVIAR PAINEL ---
    if (int.isChatInputCommand() && int.commandName === 'enviar') {
        const emb = new EmbedBuilder().setTitle('Tribunal | Atendimento').setDescription('Selecione abaixo:').setColor(0x2b2d31);
        const menu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('menu_ticket').setPlaceholder('Selecione uma opção')
                .addOptions([{label:'SUPORTE',value:'sup'},{label:'DENÚNCIA',value:'den'},{label:'PARCERIA',value:'par'}])
        );
        int.channel.send({ embeds: [emb], components: [menu] });
        int.reply({ content: 'Enviado!', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN || process.env.TOKEN);
