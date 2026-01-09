require('dotenv').config();

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const config = require('./src/config/config');
const { TTLMap } = require('./src/utils/cache');
const { initModelStats } = require('./src/services/gemini.service');
const { isAdmin, getUserRole } = require('./src/utils/auth.util');
const { detectIntent, INTENTS } = require('./src/services/intent.service');
const { initPersistence } = require('./src/utils/persistence');

// 🔥 IMPORT ALL HANDLERS (SAMA SEPERTI INDEX.JS)
const { 
  handleAddProject, handleEditProject, handleShowProject, 
  handleConfirmProject, handleCancelProject 
} = require('./src/handlers/project.handler');

const { handleClearCommand, handleSheetsCommand, handleMemoryCommand, handleModelsCommand } = require('./src/handlers/command.handler');
const { handleStorageCommand } = require('./src/handlers/storage.handler');
const { handleShowKantongSaku } = require('./src/handlers/kantongsaku.handler');
const { extractQuery, generateResponse } = require('./src/handlers/message.handler');

// Validate config
config.validate();

// Global state
let botReadyTimestamp = null;
const optimizedCache = new TTLMap(3600000);
const busyUsers = new Set();
const deleteConfirmations = new Map();

// 🔥 SHARED STATE - EXPOSE GLOBALLY untuk handlers
global.deleteConfirmations = deleteConfirmations;
global.busyUsers = busyUsers;
global.optimizedCache = optimizedCache;

const BOT_PREFIX = '!'; // Prefix untuk trigger bot (contoh: !lihat projects)
const REQUIRE_PREFIX = true; // Set false jika ingin process semua message

// ✅ ADAPTER: Convert Baileys message ke format whatsapp-web.js
function adaptMessage(baileysMsg, sock) {
  const text = baileysMsg.message?.conversation ||
               baileysMsg.message?.extendedTextMessage?.text ||
               baileysMsg.message?.imageMessage?.caption || '';

  return {
    from: baileysMsg.key.remoteJid.split('@')[0], // Extract nomor saja
    body: text,
    timestamp: baileysMsg.messageTimestamp,
    hasMedia: !!(baileysMsg.message?.imageMessage || baileysMsg.message?.videoMessage),
    hasQuotedMsg: !!baileysMsg.message?.extendedTextMessage?.contextInfo?.quotedMessage,
    getQuotedMessage: async () => {
      const quoted = baileysMsg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quoted) {
        return {
          body: quoted.conversation || quoted.extendedTextMessage?.text || ''
        };
      }
      return null;
    },
    downloadMedia: async () => null, // Simplified
    reply: async (text) => {
      // ✅ QUOTE REPLY - balas dengan quote ke pesan asli
      await sock.sendMessage(baileysMsg.key.remoteJid, 
        { text: text }, 
        { quoted: baileysMsg }
      );
    }
  };
}

let sock; // Global socket reference

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Spreadsheet Bot v2.0"),
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 ===== QR CODE GENERATED! =====');
      qrcode.generate(qr, { small: true });
      console.log('📌 Settings → Linked Devices → Link Device');
      console.log('⏱️  QR expire 20s\n');
      return;
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`❌ Connection closed: ${lastDisconnect?.error}, Reconnect: ${shouldReconnect}`);
      if (shouldReconnect) setTimeout(startBot, 5000);
      return;
    }

    if (connection === 'open') {
      botReadyTimestamp = Math.floor(Date.now() / 1000) + 5;
      initPersistence();
      initModelStats();
      console.log('\n✅ ULTRA ROBUST SPREADSHEET BOT READY (Baileys)!');
      console.log(`📊 API: ${config.spreadsheetWebAppUrl ? '✅ OK' : '❌ .env missing'}`);
      console.log(`💬 Prefix: ${REQUIRE_PREFIX ? `🔒 ON (use "${BOT_PREFIX}" to trigger)` : '🔓 OFF (all messages processed)'}`);
      console.log(`📂 Data Storage: File-based (data/ folder) with per-user isolation\n`);
    }
  });

  // ✅ MESSAGE HANDLER (SAMA SEPERTI INDEX.JS)
  sock.ev.on('messages.upsert', async (m) => {
    const message = m.messages[0];
    if (!message.message || message.key.fromMe) return; // Skip if no message or from self

    if (!botReadyTimestamp || message.messageTimestamp < botReadyTimestamp) return;

    const userId = message.key.remoteJid.split('@')[0]; // Extract nomor saja
    
    // Adapt message ke format yang kompatibel
    const msg = adaptMessage(message, sock);

    if (busyUsers.has(userId)) return;
    if (REQUIRE_PREFIX && !message.message.conversation?.startsWith(BOT_PREFIX)) {
      const textCheck = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
      if (!textCheck.startsWith(BOT_PREFIX)) {
        return;
      }
    }

    // Remove prefix dari message untuk processing
    let messageBody = msg.body;
    if (messageBody.startsWith(BOT_PREFIX)) {
      messageBody = messageBody.substring(BOT_PREFIX.length).trim();
    }

    // ✅ CACHE ADMIN STATUS ONCE - jangan check berkali-kali
    const isUserAdmin = isAdmin(userId);
    const userRole = getUserRole(userId);
    
    console.log(`🔐 User auth cached: ${userId} | Role: ${userRole} | Admin: ${isUserAdmin}`);

    // ✅ EARLY DETECTION: Kantong Saku (bypass intent detection)
    const messageBodyLower = messageBody.toLowerCase();
    if (messageBodyLower.includes('kantong') && messageBodyLower.includes('saku')) {
      console.log('⚡ EARLY DETECT: KANTONG SAKU - bypass intent detection');
      
      // Check admin access
      if (!isUserAdmin) {
        return await msg.reply(`🔒 Hanya admin yang bisa akses Kantong Saku!\n👤 Role anda: ${userRole}\n\nHubungi admin untuk informasi pengeluaran.`);
      }
      
      // Fetch and return kantong saku
      return await handleShowKantongSaku(msg, userId);
    }

    // 🔥 SMART COMMAND ROUTING dengan AI Intent Detection
    const pendingAction = deleteConfirmations.get(userId)?.action;

    try {
      // Extract context dari message (gunakan messageBody tanpa prefix)
      const { query, replyContext } = await extractQuery({ ...msg, body: messageBody });
      
      // 🧠 Detect intent dengan AI
      console.log('🧠 Detecting user intent...');
      const { intent, confidence, parameters, topic } = await detectIntent(query, replyContext);
      
      console.log(`✨ Intent: ${intent} | Confidence: ${confidence}`);
      
      // ========== INTENT-BASED ROUTING ==========
      
      // 🔒 PROJECT-RELATED INTENTS (Admin only)
      if ([INTENTS.ADD_PROJECT, INTENTS.EDIT_PROJECT, INTENTS.CONFIRM_PROJECT, INTENTS.CANCEL_PROJECT].includes(intent)) {
        if (!isUserAdmin) {
          return await msg.reply(`🔒 Hanya admin yang bisa manage projects.\n👤 Role anda: ${userRole}`);
        }
      }
      
      // ADD_PROJECT Intent
      if (intent === INTENTS.ADD_PROJECT) {
        console.log('🔥 ADD PROJECT INTENT TRIGGERED!');
        return await handleAddProject(msg, userId, busyUsers);
      }
      
      // EDIT_PROJECT Intent
      if (intent === INTENTS.EDIT_PROJECT) {
        console.log('🔧 EDIT PROJECT INTENT TRIGGERED!');
        if (pendingAction === 'addproject') {
          return await handleEditProject(msg, userId, busyUsers);
        }
        return await msg.reply('❌ Edit apa? Gunakan `.addproject` dulu atau tambah project baru.');
      }
      
      // SHOW_PROJECT Intent
      if (intent === INTENTS.SHOW_PROJECT) {
        console.log('👀 SHOW PROJECT INTENT TRIGGERED!');
        if (pendingAction === 'addproject') {
          return await handleShowProject(msg, userId);
        }
        return await msg.reply('❌ Show apa? Gunakan `.addproject` dulu atau tambah project baru.');
      }
      
      // CONFIRM_PROJECT Intent
      if (intent === INTENTS.CONFIRM_PROJECT) {
        console.log('✅ CONFIRM PROJECT INTENT TRIGGERED!');
        if (pendingAction === 'addproject') {
          return await handleConfirmProject(msg, userId, busyUsers);
        }
        return await msg.reply('❌ Tidak ada aksi pending. Tambah project dulu dengan menyebutkan project baru.');
      }
      
      // CANCEL_PROJECT Intent
      if (intent === INTENTS.CANCEL_PROJECT) {
        console.log('❌ CANCEL PROJECT INTENT TRIGGERED!');
        if (pendingAction === 'addproject') {
          return await handleCancelProject(msg, userId);
        }
        return await msg.reply('❌ Tidak ada aksi yang dibatalkan.');
      }
      
      // CLEAR_MEMORY Intent
      if (intent === INTENTS.CLEAR_MEMORY) {
        console.log('🗑️ CLEAR MEMORY INTENT TRIGGERED!');
        return handleClearCommand(msg, userId);
      }
      
      // SHOW_SHEETS Intent
      if (intent === INTENTS.SHOW_SHEETS) {
        console.log('📊 SHOW SHEETS INTENT TRIGGERED!');
        return handleSheetsCommand(msg);
      }
      
      // SHOW_MEMORY Intent
      if (intent === INTENTS.SHOW_MEMORY) {
        console.log('🧠 SHOW MEMORY INTENT TRIGGERED!');
        if (topic) {
          console.log(`📌 Topic requested: ${topic}`);
        }
        return handleMemoryCommand(msg, userId, topic);
      }
      
      // SHOW_MODELS Intent
      if (intent === INTENTS.SHOW_MODELS) {
        console.log('🤖 SHOW MODELS INTENT TRIGGERED!');
        return handleModelsCommand(msg);
      }
      
      // SHOW_STORAGE Intent
      if (intent === INTENTS.SHOW_STORAGE) {
        console.log('📂 SHOW STORAGE INTENT TRIGGERED!');
        return handleStorageCommand(msg, userId);
      }
      
      // SHOW_KANTONGSAKU Intent (ADMIN ONLY)
      if (intent === INTENTS.SHOW_KANTONGSAKU) {
        console.log('💰 SHOW KANTONGSAKU INTENT TRIGGERED!');
        
        // ✅ SUDAH CACHED - tidak perlu check ulang
        if (!isUserAdmin) {
          return await msg.reply(`🔒 Hanya admin yang bisa akses Kantong Saku!\n👤 Role anda: ${userRole}\n\nHubungi admin untuk informasi pengeluaran.`);
        }
        
        return await handleShowKantongSaku(msg, userId);
      }
      
      // HELP Intent
      if (intent === INTENTS.HELP) {
        console.log('❓ HELP INTENT TRIGGERED!');
        // ✅ SUDAH CACHED - gunakan isUserAdmin
        let helpText = `🤖 **SPREADSHEET BOT HELP** v2.0\n`;
        helpText += `👤 Role: ${userRole.toUpperCase()}\n\n`;
        
        if (isUserAdmin) {
          helpText += `💼 **Project Management (ADMIN ONLY):**\n`;
          helpText += `• "saya ingin tambah project baru"\n`;
          helpText += `• "ubah title project: ..."\n`;
          helpText += `• "lihat project pending"\n`;
          helpText += `• "konfirmasi ini / oke deh"\n`;
          helpText += `• "batalkan / ngga jadi"\n\n`;
          
          helpText += `💰 **Kantong Saku (ADMIN ONLY):**\n`;
          helpText += `• "lihat kantong saku"\n`;
          helpText += `• "kantong saku berapa"\n`;
          helpText += `• "pengeluaran bulan ini"\n`;
          helpText += `• "laporan uang / expense report"\n\n`;
        }
        
        helpText += `📊 **Utilities:**\n`;
        helpText += `• "lihat sheets / daftar sheet"\n`;
        helpText += `• "lihat memory / chat history"\n`;
        helpText += `• "hapus memory / reset chat"\n`;
        helpText += `• "info model / models"\n`;
        helpText += `• "storage berapa / disk usage"\n\n`;
        helpText += `💬 **Chat:**\n`;
        helpText += `• Tanyakan apapun ke AI - bot akan otomatis mengerti intent Anda!`;
        
        return await msg.reply(helpText);
      }
      
      // DEFAULT: CHAT Intent
      if (intent === INTENTS.CHAT) {
        console.log('💬 NORMAL CHAT INTENT');
        busyUsers.add(userId);
        
        try {
          if (!query.trim()) {
            await msg.reply('💡 Tanyakan apapun ke saya!\nContoh: "lihat Projects", "data apa saja"');
            return;
          }

          const cacheKey = query + (replyContext ? '|' + replyContext.substring(0,50) : '');
          const cached = optimizedCache.get(cacheKey);
          if (cached) {
            console.log('📦 Cache HIT - returning cached response');
            await msg.reply(cached);
            return;
          }

          let imageData = null;
          if (msg.hasMedia) {
            const media = await msg.downloadMedia().catch(() => null);
            if (media && media.mimetype.startsWith('image/')) {
              imageData = { mimetype: media.mimetype, data: media.data };
              console.log('🖼️ Image detected');
            }
          }

          const { addToRecentChat, initUserMemory } = require('./src/memory/memory.service');
          
          // 🔥 CRITICAL: Initialize memory SEBELUM generate response
          initUserMemory(userId);
          
          console.log('📝 Adding user message to recent chat...');
          await addToRecentChat(userId, 'user', query);
          
          console.log('🤖 Generating response with memory...');
          const response = await Promise.race([
            generateResponse(userId, query, !!imageData, imageData, replyContext),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000))
          ]);

          console.log('💾 Caching response...');
          optimizedCache.set(cacheKey, response);
          
          console.log('📤 Sending reply...');
          await msg.reply(response.trim());
          
        } catch (error) {
          console.error('❌ CHAT ERROR:', error.message);
          console.error('Stack trace:', error.stack);
          await msg.reply('⚠️ Error teknis. Coba lagi dalam beberapa saat.');
        } finally {
          busyUsers.delete(userId);
        }
      }
      
    } catch (error) {
      console.error('❌ MESSAGE HANDLER ERROR:', error);
      await msg.reply('⚠️ Terjadi error. Coba lagi atau hubungi admin.');
    }
  });

  await sock.waitForSocketOpen();
}

startBot().catch(err => {
  console.error('❌ Bot startup error:', err);
  process.exit(1);
});

