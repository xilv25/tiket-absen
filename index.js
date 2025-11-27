// index.js — LimeHub All-in-One (Ticket + Absen + Bilingual Embeds)
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

// env helper awal (seed)
const HELPER_IDS_ENV = (process.env.HELPER_IDS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const SPECIAL_HELPER_ID = process.env.SPECIAL_HELPER_ID || null; // admin yg bisa dipanggil lewat password

// =====================================
// FILE CONFIG (ABSEN STAFF + OWNER)
// =====================================
const OWNER_STORE_PATH = path.join(__dirname, "owner_selector.json");
const OWNER_CONFIG_PATH = path.join(__dirname, "owner_config.json");
const ABSEN_STAFF_PATH = path.join(__dirname, "absen_staff.json");

// list helper dinamis (buat absen + support selector)
let helperIds = [];

// load helperIds dari file, kalau gak ada pakai env
try {
  if (fs.existsSync(ABSEN_STAFF_PATH)) {
    const raw = fs.readFileSync(ABSEN_STAFF_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) helperIds = arr.map(String);
  }
} catch (e) {
  console.error("❌ load absen_staff.json:", e);
}
if (!helperIds.length) helperIds = [...HELPER_IDS_ENV];

function saveHelperIds() {
  try {
    fs.writeFileSync(
      ABSEN_STAFF_PATH,
      JSON.stringify(helperIds, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error("❌ save absen_staff.json:", e);
  }
}

// OWNER CONFIG (password + siapa aja yg pernah call)
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

for (const id of helperIds) {
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
  for (const id of helperIds) {
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
    .setDescription("Setup ticket panel on this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("faq")
    .setDescription("Manage FAQs for support tickets.")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Add / update one FAQ item.")
        .addStringOption((opt) =>
          opt
            .setName("question")
            .setDescription("Frequently asked questions.")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("answer")
            .setDescription("The answer to the question.")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("View all FAQ questions.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete one of the FAQ questions.")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  // /absen panel + /absen staff
  new SlashCommandBuilder()
    .setName("absen")
    .setDescription("Staff attendance panel & configuration.")
    .addSubcommand((sub) =>
      sub.setName("panel").setDescription("Show staff absence panel.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("staff")
        .setDescription("Add / delete staff in the attendance panel.")
        .addStringOption((opt) =>
          opt
            .setName("action")
            .setDescription("Actions to be taken")
            .setRequired(true)
            .addChoices(
              { name: "add", value: "add" },
              { name: "remove", value: "remove" }
            )
        )
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Staff to be arranged")
            .setRequired(true)
        )
    )
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Toggle blacklist channel from attendance system.")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channels to be blacklisted / un-blacklisted.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("owner")
    .setDescription("Admin helper settings.")
    .addSubcommand((sub) =>
      sub
        .setName("setpassword")
        .setDescription("Set admin password for selector.")
        .addStringOption((opt) =>
          opt
            .setName("password")
            .setDescription("New password (will not be displayed).")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("ownerreset")
    .setDescription("Reset the list of users who have called the admin.")
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

  for (const id of helperIds) {
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

  const body =
    lines.join("\n") || "There is no staff helper data yet. Add it via `/absen staff`.";

  const desc = [
    "Staff activity and attendance overview.",
    "",
    body,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle("📊 LimeHub Staff Attendance Panel")
    .setDescription(desc)
    .setImage(FOOTER_GIF)
    .setFooter({ text: footerText("Support") });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("absent_status_on")
      .setLabel("ON")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("absent_status_rest")
      .setLabel("REST")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("absent_status_off")
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
    helperIds.includes(message.author.id) &&
    !blacklistedChannels.has(channel.id)
  ) {
    const data = staffData.get(message.author.id);
    if (data) {
      data.msgCount += 1;
      data.msgPoints = Math.floor(data.msgCount / 1000);
    }
  }

  const guild = message.guild;

  // ----- TICKET .done (purchase) -----
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
          "❌ Only staff/helpers can use `.done`."
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
            "__**English!**__"
            "",
            "__**Purchase completed successfully🛒.**__",
            "",
            "__**Next Step**__",
            `• Next, take your script in ${premiumMention}.`,
            "",
            "__**How to Get the Script**__",
            "• Click **"Get Script"** to receive your script.",
            "• Copy your script and remove any part that is not included in the real script.",
            "",
            "Follow the example image below.",
            "",
            "If you have issues executing the script,make sure you have done it according to the example below.",
            "",
            "",
            "__**Indonesian!**__"
            "",
            "__**Pembelian berhasil diselesaikan🛒.**__",
            "",
            "__**Langkah Berikutnya**__",
            `• Berikutnya, ambil skrip Anda di ${premiumMention}.`,
            "",
            "__**Cara Mengambil Script**__",
            "• Klik **"Get Script"** untuk mendapatkan skrip Anda.",
            "• Salin script Anda dan hapus bagian mana pun yang tidak termasuk dalam script aslinya.",
            "",
            "Ikuti contoh gambar di bawah ini.",
            "",
            "Jika Anda mengalami masalah saat menjalankan script, pastikan Anda telah melakukannya sesuai contoh di bawah ini.",    
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
    .setTitle("📊 QUEUE STATUS")
    .setDescription(
      [
        "Halo ${message.member}, your proof of payment has been received.✅",
      ].join("\n")
    )
    .addFields({
      name: "**YOUR QUEUE POSITION**",
      value: [
        "```yaml",
        `Position: #${position} of ${total}`,
        "```",
      ].join("\n"),
    })
    .addFields({
      name: "✨",
      value: [
        "Your ticket will be processed shortly.",
      ].join("\n"),
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
  if (!helperIds.includes(id)) return;

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
            "__**Create a New Ticket**__",
            "",
            "Click the button below to create a ticket based on your needs.",
            "",
            "Use the ticket only for :",
            "",
            `Transaction / Support`,
            "",
            "-# Use tickets to purchase scripts and ask questions.",
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
        content: "✅ Ticket panel has been created.",
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
          content: `✅ FAQ item #${id} added:\n**Q:** ${question}`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "list") {
        if (!faqItems.length) {
          await replyOnce(interaction, {
            content: "📚 There are no FAQs saved yet yg.",
            ephemeral: true,
          });
          return;
        }

        const listText = faqItems
          .map((f) => `\`#${f.id}\` **${f.question}**`)
          .join("\n");

        const desc = [
          "__**All available FAQ questions:**__",
          "",
          listText,
        ].join("\n");

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
            content: "❌ There are no FAQs that can be deleted.",
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
          .setPlaceholder("Select the FAQ question you want to delete.")
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(menu);

        await replyOnce(interaction, {
          content: "Select the question you want to delete:",
          components: [row],
          ephemeral: true,
        });
        return;
      }
    }

    // /absen panel & /absen staff
    if (commandName === "absen") {
      const sub = interaction.options.getSubcommand();

      // /absen panel
      if (sub === "panel") {
        const { embed, row } = buildAbsenPanel();
        await replyOnce(interaction, {
          embeds: [embed],
          components: [row],
          ephemeral: false,
        });
        return;
      }

      // /absen staff
      if (sub === "staff") {
        if (
          !interaction.member.permissions.has(
            PermissionFlagsBits.Administrator
          )
        ) {
          await replyOnce(interaction, {
            content: "❌ Only admin can manage staff absence list.",
            ephemeral: true,
          });
          return;
        }

        const action = interaction.options.getString("action", true);
        const user = interaction.options.getUser("user", true);
        const id = user.id;

        if (action === "add") {
          if (helperIds.includes(id)) {
            await replyOnce(interaction, {
              content: `⚠️ ${user} is already in the attendance panel.`,
              ephemeral: true,
            });
            return;
          }

          helperIds.push(id);
          staffData.set(id, {
            status: "off",
            msgCount: 0,
            msgPoints: 0,
            dutyMs: 0,
            dutyPoints: 0,
            ticketPoints: 0,
          });
          saveHelperIds();

          await replyOnce(interaction, {
            content: `✅ ${user} added to attendance panel.`,
            ephemeral: true,
          });
          return;
        }

        if (action === "remove") {
          if (!helperIds.includes(id)) {
            await replyOnce(interaction, {
              content: `⚠️ ${user} is not in the attendance panel.`,
              ephemeral: true,
            });
            return;
          }

          helperIds = helperIds.filter((x) => x !== id);
          staffData.delete(id);
          stageSessions.delete(id);
          saveHelperIds();

          await replyOnce(interaction, {
            content: `✅ ${user} is removed from the attendance panel.`,
            ephemeral: true,
          });
          return;
        }
      }
    }

    // /blacklist
    if (commandName === "blacklist") {
      const ch = interaction.options.getChannel("channel", true);
      if (blacklistedChannels.has(ch.id)) {
        blacklistedChannels.delete(ch.id);
        await replyOnce(interaction, {
          content: `✅ Channel ${ch} **removed** from blacklist.`,
          ephemeral: true,
        });
      } else {
        blacklistedChannels.add(ch.id);
        await replyOnce(interaction, {
          content: `✅ Channel ${ch} **added** to blacklist.`,
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
            "✅ The admin password for the selector has been set. (The password is not displayed.).)",
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
        content: "✅ The list of users who have called the admin has been reset..",
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
      if (!helperIds.includes(uid)) {
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
        content: `✅ Your current absence status: \`${newStatus.toUpperCase()}\``,
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

      const channelName = isSupportTicket
        ? `support—${number}❓`
        : `purchase—${number}🛒`;

      const ticketChan = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: TICKET_CATEGORY_ID || undefined,
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
              `Halo ${member}, Thank you for creating a ticket on **LimeHub**.`,
              "",
              "__**Script Price**__",
              "💵 Script Price: Rp 40.000",
              "",
              "__**Payment Methods**__",
              "",
              "🔗 **Qris:** [Click here to pay](https://shinzux.vercel.app/image_4164bbec-5215-4e0c-98ca-d4c198a10c9e.png) — pay via Qris.",
              "🔗 **Paypal:** [Click here to pay](https://www.paypal.me/RizkiJatiPrasetyo) — pay via Paypal.",
              "",
              "__**Important**__",
              "After payment, you **MUST** upload a screenshot of your payment proof.",
              "",
              "__**Ticket Handling**__",
              `${handlerMention} will process your ticket after your payment is verified.`,
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
              `Halo ${member}, Thank you for opening a support ticket. **LimeHub**.`,
              "",
              "Before our team replies directly, Please choose one of the questions below that matches your issue.",
              "",
              "**Many common issues are already answered in FAQ.",
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
              ? [
                  "Choose a question that matches your problem.",
                ].join("\n")
              : [
                  "No FAQ has been set yet, Please wait for LimeHub Team to reply.",
                ].join("\n")
          )
          .setImage(FOOTER_GIF)
          .setFooter({ text: footerText("Support") });

        const faqOptions = faqItems.map((f) => ({
          label: f.question.slice(0, 100),
          value: f.id,
        }));

        const faqMenu = new StringSelectMenuBuilder()
          .setCustomId("support_faq_select")
          .setPlaceholder("Select a FAQ question here")
          .addOptions(
            faqOptions.length
              ? faqOptions
              : [{ label: "There are no FAQs yet", value: "none" }]
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
            label: "There are no helpers online at the moment",
            value: "none",
          });
        }

        const helperMenu = new StringSelectMenuBuilder()
          .setCustomId("support_helper_select")
          .setPlaceholder("Select a helper who is online")
          .addOptions(helperOptions);
        const helperRow = new ActionRowBuilder().addComponents(helperMenu);

        await ticketChan.send({
          embeds: [faqEmbed],
          components: [faqRow, helperRow],
        });
      }

      const confirmEmbed = new EmbedBuilder()
        .setColor(THEME_COLOR)
        .setTitle("✅ Ticket created successfully")
        .setDescription(
          [
            `Your ticket was successfully created : ${ticketChan}.`,
            "",
            "Click the button below to go to your ticket.",
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
          content: "❌ You do not have permission to claim this ticket..",
          ephemeral: true,
        });
        return;
      }

      // +0.5 point jika dia helper yang dipantau absen
      if (helperIds.includes(interaction.user.id)) {
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

      // PURCHASE: processing + 1 menit countdown ke closed
      if (isPurchase) {
        const processingEmbed = new EmbedBuilder()
          .setColor(THEME_COLOR)
          .setTitle("🛠️ Ticket Processing")
          .setDescription(
            [
              `This ticket is being processed by ${interaction.member}.`,
              "",
              `Hello ${ticketUserMention}, Please wait while we confirm your payment.`,
            ].join("\n")
          )
          .setImage(FOOTER_GIF)
          .setFooter({ text: footerText("Purchase") });

        await channel.send({ embeds: [processingEmbed] });

        await interaction.reply({
          content: "✅ You have claimed this ticket.",
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
                  "__**Your ticket has been completed.**__",
                  `Halo ${ticketUserMention}, your ticket is complete.`,
                  "",
                  "__**Next Step**__",
                  `Please continue to ${premiumMention} to get your script.`,
                  "",
                  "__**Short Command**__",
                  "Go to the FAQ channel to find out the information you need.",
                  "",
                  "Auto Close Countdown",
                  `Ticket will be closed automatically in **${formatTime(
                    sec
                  )}**.`,
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
                    [
                      "This purchase ticket has been closed. Thank you for using LimeHub services.",
                    ].join("\n")
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
          content: "✅ You have claimed this support ticket.",
          ephemeral: true,
        });

        let remaining = 300; // 5 menit
        const makeSupportEmbed = (sec) =>
          new EmbedBuilder()
            .setColor(THEME_COLOR)
            .setTitle("✅ Ticket has been resolved")
            .setDescription(
              [
                "FAQ session in this ticket has ended.",
                "",
                `This ticket is currently being processed by ${interaction.member}.`,
                "",
                `Halo ${ticketUserMention}, Your ticket will be automatically closed in 5 minutes.`,
                "",
                "__**Auto Close Countdown**__",
                `Ticket will be automatically closed in **${formatTime(
                  sec
                )}**.`,
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
                  [
                    "This support ticket has been closed. Thank you for using LimeHub services.",
                  ].join("\n")
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
          content: "❌ You do not have permission to close this ticket.",
          ephemeral: true,
        });
        return;
      }

      claimedTickets.delete(channel.id);

      const buildEmbed = (sec) =>
        new EmbedBuilder()
          .setColor(THEME_COLOR)
          .setTitle("🔒 Closing Ticket")
          .setDescription(
            [
              `Ticket will close in **${sec} seconds**.`,
            ].join("\n")
          )
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
          content: "❌ You do not have permission to delete FAQ.",
          ephemeral: true,
        });
        return;
      }

      const id = interaction.values[0];
      const idx = faqItems.findIndex((f) => f.id === id);
      if (idx === -1) {
        await interaction.reply({
          content: "❌ FAQ not found (may have been deleted).",
          ephemeral: true,
        });
        return;
      }

      const [removed] = faqItems.splice(idx, 1);
      await interaction.reply({
        content: `✅ FAQ \`#${id}\` removed:\n**${removed.question}**`,
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
          content: "❌ This menu is for support tickets only.",
          ephemeral: true,
        });
        return;
      }

      if (value === "none") {
        await interaction.reply({
          content: "There are no FAQs available yet.",
          ephemeral: true,
        });
        return;
      }

      const faq = faqItems.find((f) => f.id === value);
      if (!faq) {
        await interaction.reply({
          content: "❌ FAQ not found (may have been reset).",
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
              "__**Question**__",
              `**Q:** ${question}`,
              "",
              "__**Answer**__",
              `**A:** ${answer}`,
              "",
              "__**FAQ session countdown**__",
              `This FAQ session will end in **${formatTime(sec)}**.`,
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
                [
                  "FAQ session has ended and this ticket has been automatically closed. Thank you for using LimeHub services.",
                ].join("\n")
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
          .setDescription(
            [
              "There are currently no helpers online.",
            ].join("\n")
          )
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
              "❌ The admin password has not been set. Use `/owner setpassword` first.",
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content:
            "🔐 Enter admin password (send **1 message** in this channel, it will be deleted automatically).",
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
            usedOwnerSelector.add(interaction.user.id);
            saveUsedOwnerSelector();

            const callEmbed = new EmbedBuilder()
              .setColor(THEME_COLOR)
              .setTitle("📣 Admin Called")
              .setDescription(
                [
                  "Password verified successfully.",
                  "Password is correct.",
                  "",
                  "Admin has been called to help with this ticket.",
                  `Calling <@${ownerId}> to help you on this ticket.`,
                ].join("\n")
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
              .setTitle("❌ Wrong Password")
              .setDescription(
                [
                  "The password you entered is incorrect.",
                ].join("\n")
              )
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
              .setTitle("⌛ Time has run out")
              .setDescription(
                [
                  "No password was sent. Please try again.",
                ].join("\n")
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
        .setDescription(
          [
            "A Helper has been called to assist you.",
            `Calling <@${helperId}> to help with this ticket.`,
          ].join("\n")
        )
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
