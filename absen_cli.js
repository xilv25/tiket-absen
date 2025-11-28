#!/usr/bin/env node
// Simple CLI: tampilkan poin absen staff dari absen_data.json (urut total poin)

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "absen_data.json");

if (!fs.existsSync(FILE)) {
  console.log("absen_data.json belum ada. Tunggu bot jalan & ada aktivitas staff.");
  process.exit(0);
}

let raw;
try {
  raw = fs.readFileSync(FILE, "utf8");
} catch (e) {
  console.error("Gagal baca absen_data.json:", e.message);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error("Gagal parse absen_data.json:", e.message);
  process.exit(1);
}

const entries = Object.entries(data).map(([id, v]) => {
  const msgPoints = Number(v.msgPoints || 0);
  const dutyPoints = Number(v.dutyPoints || 0);
  const ticketPoints = Number(v.ticketPoints || 0);
  const status = v.status || "off";
  const total = msgPoints + dutyPoints + ticketPoints;

  // tampilkan id singkat biar tabel gak kepanjangan
  const shortId = id.length > 6 ? id.slice(-6) : id;

  return {
    id,
    shortId,
    status,
    msgPoints,
    dutyPoints,
    ticketPoints,
    total,
  };
});

// urut dari total poin terbesar
entries.sort((a, b) => b.total - a.total);

console.clear();
console.log("=== LimeHub Staff Points (Realtime) ===");
console.log(new Date().toLocaleString("id-ID"));
console.log("");

if (!entries.length) {
  console.log("Belum ada data staff di absen_data.json");
  process.exit(0);
}

console.log("ID (last 6)  STATUS  MSG  DUTY  TICKET  TOTAL");
console.log("------------------------------------------------");

for (const e of entries) {
  const line =
    `${e.shortId.padEnd(10)} ` +
    `${e.status.padEnd(6)} ` +
    `${String(e.msgPoints).padStart(3)}  ` +
    `${String(e.dutyPoints).padStart(4)}  ` +
    `${String(e.ticketPoints).padStart(6)}  ` +
    `${String(e.total).padStart(5)}`;

  console.log(line);
}

