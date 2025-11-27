// index.js — LimeHub All-in-One (Ticket + Absen)
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  StringSelectMenuBuilder,
} = require("discord.js");

// =====================================
// BASIC CONFIG & FOOTER
// =====================================
const THEME_COLOR = 0x00cf91;
const FOOTER_GIF =
  "https://media.discordapp.net/attachments/1264174867784142860/1278361754308575314/UhUsLgQ.gif?ex=68e9c1e9&is=68e87069&hm=5025841d8af59d93c656156b609d6ea37be1f13824ac61c6a72190e720245ac6&";

function footerText(context) {
  const date = new Date();
  const formatted = date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `created by @unstoppable_neid | LimeHub ${context} | Today - ${formatted}`;
}

// =====================================
// CLIENT
// =====================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// =====================================
// ENV CONFIG
// =====================================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID || null; // staff purchase
const HELPER_ROLE_ID = process.env.HELPER_ROLE_ID || null; // LimeHub Team support
const PREMIUM_ROLE_ID = process.env.PREMIUM_ROLE_ID || null; // role premium user

const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null; // kategori ticket
const PREMIUM_PANEL_CHANNEL_ID = process.env.PREMIUM_PANEL_CHANNEL_ID || null;

const TICKET_START_NUMBER = Number(process.env.TICKET_START_NUMBER) || 8828;
let ticketCounter = TICKET_START_NUMBER;

const SUPPORT_TICKET_START_NUMBER =
  Number(process.env.SUPPORT_TICKET_START_NUMBER) || 0;
let supportTicketCounter = SUPPORT_TICKET_START_NUMBER;

const HELPER_IDS = (process.env.HELPER_IDS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const SPECIAL_HELPER_ID = process.env.SPECIAL_HELPER_ID || null; // admin yg bisa dipanggil lewat password

// =====================================
// OWNER CONFIG (PASSWORD ADMIN + LOG PEMANGGIL)
// =====================================
const OWNER_STORE_PATH = path.join(__dirname, "owner_selector.json");
const OWNER_CONFIG_PATH = path.join(__dirname, "owner_config.json");

let usedOwnerSelector = new Set(); // user yang pernah sukses call admin
let ownerConfig = { password: null };

try {
  if (fs.existsSync(OWNER_STORE_PATH)) {
    const raw = fs.readFileSync(OWNER_STORE_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) usedOwnerSelector = new Set(arr);
  }
} catch (e) {
  console.error("❌ load owner_selector.json:", e);
}

try {
  if (fs.existsSync(OWNER_CONFIG_PATH)) {
    const raw = fs.readFileSync(OWNER_CONFIG_PATH, "utf8");
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") ownerConfig = obj;
  }
} catch (e) {
  console.error("❌ load owner_config.json:", e);
}

function saveUsedOwnerSelector() {
  try {
    fs.writeFileSync(
      OWNER_STORE_PATH,
      JSON.stringify([...usedOwnerSelector], null, 2),
      "utf8"
    );
  } catch (e) {
    console.error("❌ save owner_selector.json:", e);
  }
}

function saveOwnerConfig() {
  try {
    fs.writeFileSync(
      OWNER_CONFIG_PATH,
      JSON.stringify(ownerConfig, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error("❌ save owner_config.json:", e);
  }
}

// =====================================
// ABSEN STATE
// =====================================
// staffData[id] = { status, msgCount, msgPoints, dutyMs, dutyPoints, ticketPoints }
const staffData = new Map();
const blacklistedChannels = new Set();
const stageSessions = new Map();
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

for (const id of HELPER_IDS) {
  staffData.set(id, {
    status: "off",
    msgCount: 0,
    msgPoints: 0,
    dutyMs: 0,
    dutyPoints: 0,
    ticketPoints: 0,
  });
}

function getOnlineHelpersForUser() {
  const result = [];
  for (const id of HELPER_IDS) {
    if (SPECIAL_HELPER_ID && id === SPECIAL_HELPER_ID) continue;
    const data = staffData.get(id);
    if (data && data.status === "on") result.push(id);
  }
  return result;
}

// =====================================
// TICKET STATE + FAQ
// =====================================
const claimedTickets = new Set();
let faqIdCounter = 0;
const faqItems = []; // {id, question, answer}
const faqCountdowns = new Map(); // channelId -> interval id

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `00:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// =====================================
// SLASH COMMANDS
// =====================================
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Setup panel tiket di channel ini.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("faq")
    .setDescription("Kelola FAQ untuk tiket support.")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Tambah / update satu item FAQ.")
        .addStringOption((opt) =>
          opt
            .setName("question")
            .setDescription("Pertanyaan yang sering ditanyakan.")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("answer")
            .setDescription("Jawaban untuk pertanyaan tersebut.")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Lihat semua pertanyaan FAQ.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Hapus salah satu pertanyaan FAQ.")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("absen")
    .setDescription("Tampilkan panel absensi staff LimeHub.")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Toggle blacklist channel dari sistem absen.")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel yang mau di-blacklist / un-blacklist.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("owner")
    .setDescription("Pengaturan admin helper.")
    .addSubcommand((sub) =>
      sub
        .setName("setpassword")
        .setDescription("Set password admin untuk selector.")
        .addStringOption((opt) =>
          opt
            .setName("password")
            .setDescription("Password baru (tidak akan ditampilkan).")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("ownerreset")
    .setDescription("Reset daftar user yang pernah call admin.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  console.log("🔁 Registering slash commands...");
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash commands registered!");
  } catch (e) {
    console.error("❌ Failed to register commands:", e);
  }
}

// =====================================
// READY
// =====================================
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag} (LimeHub All-in-One)`);
  await registerCommands();
});

// =====================================
// HELPER replyOnce
// =====================================
async function replyOnce(interaction, options) {
  if (interaction.replied || interaction.deferred)
    return interaction.followUp(options);
  return interaction.reply(options);
}

// =====================================
// ABSEN PANEL BUILDER
// =====================================
function buildAbsenPanel() {
  const lines = [];

  for (const id of HELPER_IDS) {
    const data = staffData.get(id);
    if (!data) continue;

    const memberMention = `<@${id}>`;

    const totalPoints = data.msgPoints + data.dutyPoints + data.ticketPoints;
    const msgProg = (data.msgCount % 1000) / 1000;
    const dutyProg = data.dutyMs / FIVE_HOURS_MS;

    const bar = (p) => {
      const total = 10;
      const filled = Math.round(p * total);
      return "▰".repeat(filled) + "▱".repeat(total - filled);
    };

    const barMsg = bar(msgProg);
    const barDuty = bar(dutyProg);

    lines.push(
      [
        `**${memberMention}** • Status: \`${data.status.toUpperCase()}\``,
        `🗨️ Chat: [${barMsg}] \`${data.msgCount} msg\` → \`${data.msgPoints} pts\``,
        `🎙 Stage: [${barDuty}] \`${data.dutyPoints} pts\``,
        `🎫 Ticket Claim: \`${data.ticketPoints} pts\``,
        `Total Poin: **${totalPoints}**`,
        "",
      ].join("\n")
    );
  }

  const desc =
    lines.join("\n") || "Belum ada data staff helper. Cek HELPER_IDS di env.";

  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle("📊 Panel Absen Staff LimeHub")
    .setDescription(desc)
    .setImage(FOOTER_GIF)
    .setFooter({ text: footerText("Support") });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("absen_status_on")
      .setLabel("ON")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("absen_status_rest")
      .setLabel("REST")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("absen_status_off")
      .setLabel("OFF")
      .setStyle(ButtonStyle.Danger)
  );

  return { embed, row };
}

// =====================================
// MESSAGE CREATE (ABSEN + QUEUE + .done)
// =====================================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const channel = message.channel;
  if (channel.type !== ChannelType.GuildText) return;

  // ----- ABSEN -----
  if (
    HELPER_IDS.includes(message.author.id) &&
    !blacklistedChannels.has(channel.id)
  ) {
    const data = staffData.get(message.author.id);
    if (data) {
      data.msgCount += 1;
      data.msgPoints = Math.floor(data.msgCount / 1000);
    }
  }

  // ----- TICKET .done (purchase) -----
  const guild = message.guild;

  if (channel.name.includes("🛒")) {
    if (message.content.trim().toLowerCase() === ".done") {
      const roles = message.member.roles.cache;
      let canUseDone = true;
      if (SUPPORT_ROLE_ID || HELPER_ROLE_ID) {
        canUseDone =
          (SUPPORT_ROLE_ID && roles.has(SUPPORT_ROLE_ID)) ||
          (HELPER_ROLE_ID && roles.has(HELPER_ROLE_ID));
      }
      if (!canUseDone) {
        return message.reply(
          "❌ Hanya staff/helper yang dapat menggunakan `.done`."
        );
      }

      claimedTickets.add(channel.id);

      const premiumMention = PREMIUM_PANEL_CHANNEL_ID
        ? `<#${PREMIUM_PANEL_CHANNEL_ID}>`
        : "`#premium-panel`";

      const doneEmbed = new EmbedBuilder()
        .setColor(THEME_COLOR)
        .setAuthor({ name: "Ticket Staff" })
        .setTitle("Done!")
        .setDescription(
          [
            "__Berhasil membeli script 🛒__",
            "",
            `• Langkah selanjutnya adalah melakukan pengambilan script di ${premiumMention}.`,
            '• Klik **"Get Script"** untuk mendapatkan script.',
            "• Kemudian copy script kamu dan lakukan pemotongan untuk membersihkan bagian yang tidak termasuk dalam script.",
            "• Ikuti contoh pada gambar.",
            "• Selesai, kamu telah berhasil mengambil script dengan baik dan benar!",
            "",
            "Apabila mengalami kendala saat execute script, pastikan kamu sudah melakukannya sesuai seperti pada contoh gambar di bawah.",
          ].join("\n")
        )
        .setImage(
          "https://cdn.discordapp.com/attachments/1407410043258798083/1441702637807472782/New_Project_227_13ED2B3.png?ex=6928b076&is=69275ef6&hm=4df368e5cff0c6ca79c2dd01061ad0610129737524370b8ef8cef4f4c409c66f&"
        )
        .setFooter({ text: footerText("Purchase") });

      await channel.send({ embeds: [doneEmbed] });
      return;
    }
  }

  // ----- QUEUE (purchase only) -----
  if (!channel.name.includes("🛒")) return;

  const attachments = [...message.attachments.values()];
  const hasImage = attachments.some((att) =>
    att.contentType?.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) =>
      att.url.toLowerCase().endsWith(ext)
    )
  );
  if (!hasImage) return;

  let openTickets = guild.channels.cache.filter(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.name.includes("🛒") &&
      !claimedTickets.has(c.id)
  );

  openTickets = openTickets.sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  );
  const arr = [...openTickets.values()];
  const total = arr.length;
  const idx = arr.findIndex((c) => c.id === channel.id);
  if (idx === -1) return;

  const position = idx + 1;

  const queueEmbed = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle("📊 STATUS ANTRIAN")
    .setDescription(
      `Halo ${message.member}, bukti pembayaran kamu sudah diterima ✅`
    )
    .addFields({
      name: "__POSISI ANTRIAN ANDA__",
      value:
        "```yaml\n" +
        `🚀 POSISI: #${position} dari ${total}\n` +
        "```",
    })
    .addFields({
      name: "✨",
      value: "Tiket kamu akan diproses sebentar lagi!",
    })
    .setImage(FOOTER_GIF)
    .setFooter({ text: footerText("Purchase") });

  await channel.send({ embeds: [queueEmbed] });
});

// =====================================
// VOICE STATE (STAGE ONLY UNTUK ABSEN)
// =====================================
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;
  const id = member.id;
  if (!HELPER_IDS.includes(id)) return;

  const data = staffData.get(id);
  if (!data) return;

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  const wasStage =
    oldChannel && oldChannel.type === ChannelType.GuildStageVoice;
  const isStage =
    newChannel && newChannel.type === ChannelType.GuildStageVoice;

  const session = stageSessions.get(id);

  if (!wasStage && isStage) {
    if (data.status === "on") {
      stageSessions.set(id, { channelId: newChannel.id, startedAt: Date.now() });
    }
    return;
  }

  if (wasStage && !isStage) {
    if (session && session.startedAt) {
      const delta = Date.now() - session.startedAt;
      data.dutyMs += delta;
      stageSessions.delete(id);
      while (data.dutyMs >= FIVE_HOURS_MS) {
        data.dutyMs -= FIVE_HOURS_MS;
        data.dutyPoints += 1;
      }
    }
    return;
  }

  if (wasStage && isStage && oldChannel.id !== newChannel.id) {
    if (session && session.startedAt) {
      const delta = Date.now() - session.startedAt;
      data.dutyMs += delta;
      while (data.dutyMs >= FIVE_HOURS_MS) {
        data.dutyMs -= FIVE_HOURS_MS;
        data.dutyPoints += 1;
      }
      stageSessions.set(id, { channelId: newChannel.id, startedAt: Date.now() });
    }
  }
});

// =====================================
// INTERACTIONS
// =====================================
client.on(Events.InteractionCreate, async (interaction) => {
  // ===== SLASH =====
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // /setup
    if (commandName === "setup") {
      const panelEmbed = new EmbedBuilder()
        .setColor(THEME_COLOR)
        .setTitle("🎟️ LimeHub Ticket Panel")
        .setDescription(
          [
            "Klik tombol di bawah untuk membuat tiket baru.",
            "",
            "Gunakan tiket hanya untuk keperluan **transaksi** dan **support** terkait layanan LimeHub.",
          ].join("\n")
        )
        .setImage(FOOTER_GIF)
        .setFooter({ text: footerText("Support") });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("create_ticket")
          .setLabel("Create Ticket")
          .setStyle(ButtonStyle.Success)
      );

      await interaction.channel.send({ embeds: [panelEmbed], components: [row] });
      await replyOnce(interaction, {
        content: "✅ Panel tiket sudah dibuat.",
        ephemeral: true,
      });
      return;
    }

    // /faq
    if (commandName === "faq") {
      const sub = interaction.options.getSubcommand();

      if (sub === "set") {
        const question = interaction.options.getString("question", true);
        const answer = interaction.options.getString("answer", true);

        faqIdCounter += 1;
        const id = String(faqIdCounter);
        faqItems.push({ id, question, answer });

        await replyOnce(interaction, {
          content: `✅ FAQ item #${id} ditambahkan:\n**Q:** ${question}`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "list") {
        if (!faqItems.length) {
          await replyOnce(interaction, {
            content: "📚 Belum ada FAQ yang tersimpan.",
            ephemeral: true,
          });
          return;
        }

        const desc = faqItems
          .map((f) => `\`#${f.id}\` **${f.question}**`)
          .join("\n");

        const listEmbed = new EmbedBuilder()
          .setColor(THEME_COLOR)
          .setTitle("📚 FAQ List")
          .setDescription(desc)
          .setImage(FOOTER_GIF)
          .setFooter({ text: footerText("Support") });

        await replyOnce(interaction, { embeds: [listEmbed], ephemeral: true });
        return;
      }

      if (sub === "remove") {
        if (!faqItems.length) {
          await replyOnce(interaction, {
            content: "❌ Tidak ada FAQ yang bisa dihapus.",
            ephemeral: true,
          });
          return;
        }

        const options = faqItems.map((f) => ({
          label: f.question.slice(0, 100),
          value: f.id,
          description: `ID #${f.id}`,
        }));

        const menu = new StringSelectMenuBuilder()
          .setCustomId("faq_remove_select")
          .setPlaceholder("Pilih pertanyaan FAQ yang ingin dihapus")
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(menu);

        await replyOnce(interaction, {
          content: "Pilih pertanyaan yang ingin dihapus:",
          components: [row],
          ephemeral: true,
        });
        return;
      }
    }

    // /absen
    if (commandName === "absen") {
      const { embed, row } = buildAbsenPanel();
      await replyOnce(interaction, {
        embeds: [embed],
        components: [row],
        ephemeral: false,
      });
      return;
    }

    // /blacklist
    if (commandName === "blacklist") {
      const ch = interaction.options.getChannel("channel", true);
      if (blacklistedChannels.has(ch.id)) {
        blacklistedChannels.delete(ch.id);
        await replyOnce(interaction, {
          content: `✅ Channel ${ch} **dihapus** dari blacklist.`,
          ephemeral: true,
        });
      } else {
        blacklistedChannels.add(ch.id);
        await replyOnce(interaction, {
          content: `✅ Channel ${ch} **ditambahkan** ke blacklist.`,
          ephemeral: true,
        });
      }
      return;
    }

    // /owner setpassword
    if (commandName === "owner") {
      const sub = interaction.options.getSubcommand();
      if (sub === "setpassword") {
        const password = interaction.options.getString("password", true);
        ownerConfig.password = password;
        saveOwnerConfig();
        await replyOnce(interaction, {
          content:
            "✅ Password admin untuk selector sudah di-set. (Password tidak ditampilkan.)",
          ephemeral: true,
        });
      }
      return;
    }

    // /ownerreset
    if (commandName === "ownerreset") {
      usedOwnerSelector = new Set();
      try {
        if (fs.existsSync(OWNER_STORE_PATH)) fs.unlinkSync(OWNER_STORE_PATH);
      } catch (e) {
        console.error("❌ hapus owner_selector.json:", e);
      }
      await replyOnce(interaction, {
        content: "✅ Daftar user yang pernah call admin sudah di-reset.",
        ephemeral: true,
      });
      return;
    }
  }

  // ===== BUTTON =====
  if (interaction.isButton()) {
    // absen status
    if (
      ["absen_status_on", "absen_status_rest", "absen_status_off"].includes(
        interaction.customId
      )
    ) {
      const uid = interaction.user.id;
      if (!HELPER_IDS.includes(uid)) {
        await interaction.reply({
          content: "❌ Kamu bukan helper, tidak bisa mengubah status absen.",
          ephemeral: true,
        });
        return;
      }

      const data = staffData.get(uid);
      if (!data) {
        await interaction.reply({
          content: "❌ Data absen kamu tidak ditemukan.",
          ephemeral: true,
        });
        return;
      }

      const oldStatus = data.status;
      let newStatus = "off";
      if (interaction.customId === "absen_status_on") newStatus = "on";
      if (interaction.customId === "absen_status_rest") newStatus = "rest";
      data.status = newStatus;

      // handle sesi stage
      const guild = interaction.guild;
      const member = await guild.members.fetch(uid).catch(() => null);
      if (member) {
        const ch = member.voice.channel;
        const isStage = ch && ch.type === ChannelType.GuildStageVoice;
        const session = stageSessions.get(uid);

        if (oldStatus === "on" && newStatus !== "on" && session) {
          const delta = Date.now() - session.startedAt;
          data.dutyMs += delta;
          stageSessions.delete(uid);
          while (data.dutyMs >= FIVE_HOURS_MS) {
            data.dutyMs -= FIVE_HOURS_MS;
            data.dutyPoints += 1;
          }
        }

        if (oldStatus !== "on" && newStatus === "on" && isStage) {
          stageSessions.set(uid, {
            channelId: ch.id,
            startedAt: Date.now(),
          });
        }
      }

      const { embed, row } = buildAbsenPanel();
      interaction.message
        .edit({ embeds: [embed], components: [row] })
        .catch(() => {});

      await interaction.reply({
        content: `✅ Status absen kamu sekarang: \`${newStatus.toUpperCase()}\``,
        ephemeral: true,
      });
      return;
    }

    // create_ticket
    if (interaction.customId === "create_ticket") {
      const guild = interaction.guild;
      const member = interaction.member;

      // pastikan belum punya ticket
      const existing = guild.channels.cache.find(
        (ch) =>
          ch.type === ChannelType.GuildText &&
          (ch.name.includes("🛒") || ch.name.includes("❓")) &&
          ch.topic === member.id
      );
      if (existing) {
        await interaction.reply({
          content: `❌ Kamu sudah punya tiket: ${existing}`,
          ephemeral: true,
        });
        return;
      }

      const hasPremium =
        PREMIUM_ROLE_ID && member.roles.cache.has(PREMIUM_ROLE_ID);

      let isSupportTicket;
      let handlerRoleId;
      let number;

      if (hasPremium) {
        isSupportTicket = true;
        handlerRoleId = HELPER_ROLE_ID || null;
        supportTicketCounter += 1;
        number = supportTicketCounter;
      } else {
        isSupportTicket = false;
        handlerRoleId = SUPPORT_ROLE_ID || null;
        ticketCounter += 1;
        number = ticketCounter;
      }

      const overwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: member.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
      ];

      if (handlerRoleId) {
        overwrites.push({
          id: handlerRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        });
      }

      // nama channel dengan prefix purchase/support + nomor + emoji
      const channelName = isSupportTicket
        ? `support—${number}❓`
        : `purchase—${number}🛒`;

      const ticketChan = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: TICKET_CATEGORY_ID || undefined, // kategori (ISI ENV)
        permissionOverwrites: overwrites,
        topic: member.id,
      });

      const handlerMention = handlerRoleId
        ? `<@&${handlerRoleId}>`
        : "Staff";

      const ticketButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("claim_ticket")
          .setLabel("Claim Ticket")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Close Ticket")
          .setStyle(ButtonStyle.Danger)
      );

      if (!isSupportTicket) {
        const ticketEmbed = new EmbedBuilder()
          .setColor(THEME_COLOR)
          .setTitle(`🎟️ Ticket #${number} — ${member}`)
          .setDescription(
            [
              `Halo ${member}, terima kasih telah membuat tiket di **LimeHub**.`,
              "",
              "💵 **Harga Script:** Rp 40.000",
              "",
              "Silakan lakukan pembayaran ke salah satu metode berikut:",
              "",
              "🔗 **Qris :** [Click here](https://shinzux.vercel.app/image_4164bbec-5215-4e0c-98ca-d4c198a10c9e.png)",
              "🔗 **Paypal :** [Click here](https://www.paypal.me/RizkiJatiPrasetyo)",
              "",
              "⚠️ Setelah melakukan pembayaran, **WAJIB** upload bukti transfer (screenshot).",
              `${handlerMention} akan memproses tiket kamu setelah bukti diterima.`,
            ].join("\n")
          )
          .setImage(FOOTER_GIF)
          .setFooter({ text: footerText("Purchase") });

        await ticketChan.send({
          embeds: [ticketEmbed],
          components: [ticketButtons],
        });
      } else {
        const supportEmbed = new EmbedBuilder()
          .setColor(THEME_COLOR)
          .setTitle(`❓ Support Ticket #${number} — ${member}`)
          .setDescription(
            [
              `Halo ${member}, terima kasih telah membuka tiket support **LimeHub**.`,
              "",
              "Sebelum LimeHub Team menjawab secara langsung, silakan pilih salah satu pertanyaan di bawah.",
              "Banyak masalah umum sudah dijawab di FAQ.",
            ].join("\n")
          )
          .setImage(FOOTER_GIF)
          .setFooter({ text: footerText("Support") });

        await ticketChan.send({
          embeds: [supportEmbed],
          components: [ticketButtons],
        });

        // panel FAQ & helper
        const faqEmbed = new EmbedBuilder()
          .setColor(THEME_COLOR)
          .setTitle("📚 FAQ Support")
          .setDescription(
            faqItems.length
              ? "Pilih pertanyaan yang paling sesuai dengan kendalamu:"
              : "Belum ada FAQ yang diset. Silakan tunggu LimeHub Team menjawab."
          )
          .setImage(FOOTER_GIF)
          .setFooter({ text: footerText("Support") });

        const faqOptions = faqItems.map((f) => ({
          label: f.question.slice(0, 100),
          value: f.id,
        }));

        const faqMenu = new StringSelectMenuBuilder()
          .setCustomId("support_faq_select")
          .setPlaceholder("Pilih pertanyaan FAQ di sini")
          .addOptions(
            faqOptions.length
              ? faqOptions
              : [{ label: "Belum ada FAQ", value: "none" }]
          );
        const faqRow = new ActionRowBuilder().addComponents(faqMenu);

        const onlineHelpers = getOnlineHelpersForUser();
        const helperOptions = [];

        for (const hid of onlineHelpers) {
          const hm = await guild.members.fetch(hid).catch(() => null);
          const label = hm?.displayName || `Helper ${hid.slice(0, 6)}...`;
          helperOptions.push({ label, value: hid });
        }

        if (SPECIAL_HELPER_ID && !usedOwnerSelector.has(member.id)) {
          helperOptions.push({
            label: "🚨 Contact Admin (priority)",
            value: `owner:${SPECIAL_HELPER_ID}`,
          });
        }

        if (!helperOptions.length) {
          helperOptions.push({
            label: "Tidak ada helper online saat ini",
            value: "none",
          });
        }

        const helperMenu = new StringSelectMenuBuilder()
          .setCustomId("support_helper_select")
          .setPlaceholder("Pilih helper yang sedang online")
          .addOptions(helperOptions);
        const helperRow = new ActionRowBuilder().addComponents(helperMenu);

        await ticketChan.send({
          embeds: [faqEmbed],
          components: [faqRow, helperRow],
        });
      }

      const confirmEmbed = new EmbedBuilder()
        .setColor(THEME_COLOR)
        .setTitle("✅ Ticket berhasil dibuat")
        .setDescription(
          [
            `Tiket kamu berhasil dibuat: ${ticketChan}`,
            "",
            "Klik tombol di bawah untuk menuju ticket kamu.",
          ].join("\n")
        )
        .setImage(FOOTER_GIF)
        .setFooter({ text: footerText("Support") });

      const jumpRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Go to ticket")
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${interaction.guildId}/${ticketChan.id}`
          )
      );

      await interaction.reply({
        embeds: [confirmEmbed],
        components: [jumpRow],
        ephemeral: true,
      });
      return;
    }

    // claim_ticket
    if (interaction.customId === "claim_ticket") {
      const channel = interaction.channel;
      const guild = interaction.guild;
      const roles = interaction.member.roles.cache;

      const isPurchase = channel.name.includes("🛒");
      const isSupport = channel.name.includes("❓");

      let canClaim = true;
      if (isPurchase) {
        canClaim = SUPPORT_ROLE_ID && roles.has(SUPPORT_ROLE_ID);
      } else if (isSupport) {
        canClaim = HELPER_ROLE_ID && roles.has(HELPER_ROLE_ID);
      }

      if (!canClaim) {
        await interaction.reply({
          content: "❌ Kamu tidak punya izin untuk claim ticket ini.",
          ephemeral: true,
        });
        return;
      }

      // +0.5 point jika dia helper yang dipantau absen
      if (HELPER_IDS.includes(interaction.user.id)) {
        const data = staffData.get(interaction.user.id);
        if (data) data.ticketPoints = (data.ticketPoints || 0) + 0.5;
      }

      claimedTickets.add(channel.id);

      let ticketUserMention = "customer";
      if (channel.topic) {
        try {
          const m = await guild.members.fetch(channel.topic);
          ticketUserMention = `${m}`;
        } catch {
          ticketUserMention = "customer";
        }
      }

      // PURCHASE: sama seperti sebelumnya (processing + 1 menit countdown ke closed)
      if (isPurchase) {
        const processingEmbed = new EmbedBuilder()
          .setColor(THEME_COLOR)
          .setTitle("🛠️ Ticket Processing")
          .setDescription(
            [
              `Tiket ini sedang diproses oleh ${interaction.member}.`,
              "",
              `Halo ${ticketUserMention}, mohon tunggu ya!`,
            ].join("\n")
          )
          .setImage(FOOTER_GIF)
          .setFooter({ text: footerText("Purchase") });

        await channel.send({ embeds: [processingEmbed] });

        await interaction.reply({
          content: "✅ Kamu telah meng-claim ticket ini.",
          ephemeral: true,
        });

        setTimeout(async () => {
          const premiumMention = PREMIUM_PANEL_CHANNEL_ID
            ? `<#${PREMIUM_PANEL_CHANNEL_ID}>`
            : "`#premium-panel`";

          const makeDoneEmbed = (sec) =>
            new EmbedBuilder()
              .setColor(THEME_COLOR)
              .setTitle("✅ Ticket Done")
              .setDescription(
                [
                  `Halo ${ticketUserMention}, tiket kamu sudah selesai.`,
                  "",
                  `Silakan lanjut ke channel ${premiumMention}.`,
                  "",
                  "Ketik \`!command\` untuk lihat semua info yang kamu cari!",
                  "",
                  `_Ticket akan otomatis ditutup dalam ${formatTime(sec)}._`,
                ].join("\n")
              )
              .setImage(FOOTER_GIF)
              .setFooter({ text: footerText("Purchase") });

          let remaining = 60;
          const msg = await channel
            .send({ embeds: [makeDoneEmbed(remaining)] })
            .catch(() => null);
          if (!msg) return;

          const interval = setInterval(() => {
            remaining--;
            if (remaining >= 0) {
              msg.edit({ embeds: [makeDoneEmbed(remaining)] }).catch(() => {});
            }
            if (remaining === 0) {
              clearInterval(interval);
              setTimeout(async () => {
                const closedEmbed = new EmbedBuilder()
                  .setColor(THEME_COLOR)
                  .setTitle("🔒 Ticket Closed")
                  .setDescription(
                    "Ticket ini telah ditutup. Terima kasih telah menggunakan layanan LimeHub."
                  )
                  .setImage(FOOTER_GIF)
                  .setFooter({ text: footerText("Purchase") });

                await channel.send({ embeds: [closedEmbed] }).catch(() => {});
                setTimeout(() => channel.delete().catch(() => {}), 1000);
              }, 1000);
            }
          }, 1000);
        }, 5000);

        return;
      }

      // SUPPORT: sesi tanya jawab berakhir + countdown 5 menit ke closed
      if (isSupport) {
        await interaction.reply({
          content: "✅ Kamu telah meng-claim ticket support ini.",
          ephemeral: true,
        });

        let remaining = 300; // 5 menit
        const makeSupportEmbed = (sec) =>
          new EmbedBuilder()
            .setColor(THEME_COLOR)
            .setTitle("🛠️ Support Ticket Processing")
            .setDescription(
              [
                "Sesi tanya jawab FAQ di ticket ini telah berakhir.",
                "",
                `Tiket ini sekarang sedang diproses oleh ${interaction.member}.`,
                "",
                `Halo ${ticketUserMention}, mohon tunggu ya!`,
                "",
                `_Ticket akan otomatis ditutup dalam ${formatTime(sec)}._`,
              ].join("\n")
            )
            .setImage(FOOTER_GIF)
            .setFooter({ text: footerText("Support") });

        const msg = await channel
          .send({ embeds: [makeSupportEmbed(remaining)] })
          .catch(() => null);
        if (!msg) return;

        const interval = setInterval(() => {
          remaining--;
          if (remaining >= 0) {
            msg.edit({ embeds: [makeSupportEmbed(remaining)] }).catch(() => {});
          }
          if (remaining === 0) {
            clearInterval(interval);
            setTimeout(async () => {
              const closedEmbed = new EmbedBuilder()
                .setColor(THEME_COLOR)
                .setTitle("🔒 Ticket Closed")
                .setDescription(
                  "Ticket support ini telah ditutup. Terima kasih telah menggunakan layanan LimeHub."
                )
                .setImage(FOOTER_GIF)
                .setFooter({ text: footerText("Support") });

              await channel.send({ embeds: [closedEmbed] }).catch(() => {});
              setTimeout(() => channel.delete().catch(() => {}), 1000);
            }, 1000);
          }
        }, 1000);

        return;
      }
    }

    // close_ticket
    if (interaction.customId === "close_ticket") {
      const channel = interaction.channel;
      const roles = interaction.member.roles.cache;

      const isPurchase = channel.name.includes("🛒");
      const isSupport = channel.name.includes("❓");

      let canClose = true;
      if (isPurchase) {
        canClose = SUPPORT_ROLE_ID && roles.has(SUPPORT_ROLE_ID);
      } else if (isSupport) {
        canClose = HELPER_ROLE_ID && roles.has(HELPER_ROLE_ID);
      }

      if (!canClose) {
        await interaction.reply({
          content: "❌ Kamu tidak punya izin untuk menutup ticket ini.",
          ephemeral: true,
        });
        return;
      }

      claimedTickets.delete(channel.id);

      const buildEmbed = (sec) =>
        new EmbedBuilder()
          .setColor(THEME_COLOR)
          .setTitle("🔒 Closing Ticket")
          .setDescription(`Ticket akan ditutup dalam **${sec} detik**.`)
          .setImage(FOOTER_GIF)
          .setFooter({
            text: footerText(isSupport ? "Support" : "Purchase"),
          });

      const msg = await interaction.reply({
        embeds: [buildEmbed(3)],
        fetchReply: true,
      });

      let remaining = 3;
      const interval = setInterval(() => {
        remaining--;
        if (remaining > 0) {
          msg.edit({ embeds: [buildEmbed(remaining)] }).catch(() => {});
        } else {
          clearInterval(interval);
          channel.delete().catch(() => {});
        }
      }, 1000);
      return;
    }
  }

  // ===== SELECT MENU =====
  if (interaction.isStringSelectMenu()) {
    // faq_remove_select
    if (interaction.customId === "faq_remove_select") {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        await interaction.reply({
          content: "❌ Kamu tidak punya izin untuk menghapus FAQ.",
          ephemeral: true,
        });
        return;
      }

      const id = interaction.values[0];
      const idx = faqItems.findIndex((f) => f.id === id);
      if (idx === -1) {
        await interaction.reply({
          content: "❌ FAQ tidak ditemukan (mungkin sudah dihapus).",
          ephemeral: true,
        });
        return;
      }

      const [removed] = faqItems.splice(idx, 1);
      await interaction.reply({
        content: `✅ FAQ \`#${id}\` dihapus:\n**${removed.question}**`,
        ephemeral: true,
      });
      return;
    }

    // support_faq_select
    if (interaction.customId === "support_faq_select") {
      const value = interaction.values[0];
      const channel = interaction.channel;

      if (!channel.name.includes("❓")) {
        await interaction.reply({
          content: "❌ Menu ini hanya untuk tiket support.",
          ephemeral: true,
        });
        return;
      }

      if (value === "none") {
        await interaction.reply({
          content: "Belum ada FAQ yang tersedia.",
          ephemeral: true,
        });
        return;
      }

      const faq = faqItems.find((f) => f.id === value);
      if (!faq) {
        await interaction.reply({
          content: "❌ FAQ tidak ditemukan (mungkin sudah direset).",
          ephemeral: true,
        });
        return;
      }

      const question = faq.question;
      const answer = faq.answer;

      const oldInterval = faqCountdowns.get(channel.id);
      if (oldInterval) clearInterval(oldInterval);

      let remaining = 300;

      const makeFaqEmbed = (sec) =>
        new EmbedBuilder()
          .setColor(THEME_COLOR)
          .setTitle("💡 FAQ Answer")
          .setDescription(
            [
              `**Q:** ${question}`,
              "",
              `**A:** ${answer}`,
              "",
              `_Session FAQ ini akan berakhir dalam ${formatTime(sec)}._`,
            ].join("\n")
          )
          .setImage(FOOTER_GIF)
          .setFooter({ text: footerText("Support") });

      const msg = await interaction.reply({
        embeds: [makeFaqEmbed(remaining)],
        fetchReply: true,
        ephemeral: false,
      });

      const interval = setInterval(() => {
        remaining--;
        if (remaining >= 0) {
          msg.edit({ embeds: [makeFaqEmbed(remaining)] }).catch(() => {});
        }
        if (remaining === 0) {
          clearInterval(interval);
          faqCountdowns.delete(channel.id);

          setTimeout(async () => {
            const closedEmbed = new EmbedBuilder()
              .setColor(THEME_COLOR)
              .setTitle("🔒 Ticket Closed")
              .setDescription(
                "Session FAQ berakhir dan ticket ini telah ditutup secara otomatis. Terima kasih telah menggunakan layanan LimeHub."
              )
              .setImage(FOOTER_GIF)
              .setFooter({ text: footerText("Support") });

            await channel.send({ embeds: [closedEmbed] }).catch(() => {});
            setTimeout(() => channel.delete().catch(() => {}), 1000);
          }, 1000);
        }
      }, 1000);

      faqCountdowns.set(channel.id, interval);
      return;
    }

    // support_helper_select
    if (interaction.customId === "support_helper_select") {
      const value = interaction.values[0];

      if (value === "none") {
        const noEmbed = new EmbedBuilder()
          .setColor(THEME_COLOR)
          .setTitle("⚠️ Helper Offline")
          .setDescription("Saat ini tidak ada helper yang online.")
          .setImage(FOOTER_GIF)
          .setFooter({ text: footerText("Support") });

        await interaction.reply({ embeds: [noEmbed], ephemeral: true });
        return;
      }

      // Contact admin (pakai password)
      if (value.startsWith("owner:")) {
        const ownerId = value.split(":")[1];

        if (!ownerConfig.password) {
          await interaction.reply({
            content:
              "❌ Password admin belum diset. Gunakan `/owner setpassword` dulu.",
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content:
            "🔐 Masukkan password admin (kirim **1 pesan** di channel ini, nanti dihapus otomatis).",
          ephemeral: true,
        });

        const filter = (m) =>
          m.author.id === interaction.user.id && !m.author.bot;

        const collector = interaction.channel.createMessageCollector({
          filter,
          max: 1,
          time: 60_000,
        });

        collector.on("collect", async (msg) => {
          const pw = msg.content.trim();
          msg.delete().catch(() => {});

          if (pw === ownerConfig.password) {
            // password benar → baru log user
            usedOwnerSelector.add(interaction.user.id);
            saveUsedOwnerSelector();

            const callEmbed = new EmbedBuilder()
              .setColor(THEME_COLOR)
              .setTitle("📣 Admin Called")
              .setDescription(
                `Password benar.\nMemanggil <@${ownerId}> untuk membantumu di tiket ini.`
              )
              .setImage(FOOTER_GIF)
              .setFooter({ text: footerText("Support") });

            await interaction.followUp({
              embeds: [callEmbed],
              ephemeral: false,
            });

            const ping = await interaction.channel
              .send(`<@${ownerId}>`)
              .catch(() => null);
            if (ping) setTimeout(() => ping.delete().catch(() => {}), 1000);
          } else {
            const failEmbed = new EmbedBuilder()
              .setColor(0xff5555)
              .setTitle("❌ Password Salah")
              .setDescription("Password yang kamu masukkan salah.")
              .setImage(FOOTER_GIF)
              .setFooter({ text: footerText("Support") });

            await interaction.followUp({
              embeds: [failEmbed],
              ephemeral: true,
            });
          }
        });

        collector.on("end", async (collected, reason) => {
          if (reason === "time" && collected.size === 0) {
            const timeoutEmbed = new EmbedBuilder()
              .setColor(THEME_COLOR)
              .setTitle("⌛ Waktu Habis")
              .setDescription(
                "Tidak ada password yang dikirim. Silakan coba lagi."
              )
              .setImage(FOOTER_GIF)
              .setFooter({ text: footerText("Support") });

            await interaction.followUp({
              embeds: [timeoutEmbed],
              ephemeral: true,
            });
          }
        });

        return;
      }

      // helper biasa
      const helperId = value;

      const helperEmbed = new EmbedBuilder()
        .setColor(THEME_COLOR)
        .setTitle("📣 Helper Called")
        .setDescription(`Memanggil <@${helperId}> untuk membantu tiket ini.`)
        .setImage(FOOTER_GIF)
        .setFooter({ text: footerText("Support") });

      await interaction.reply({ embeds: [helperEmbed], ephemeral: false });

      const ping = await interaction.channel
        .send(`<@${helperId}>`)
        .catch(() => null);
      if (ping) setTimeout(() => ping.delete().catch(() => {}), 1000);

      return;
    }
  }
});

// =====================================
// LOGIN
// =====================================
client.login(TOKEN);