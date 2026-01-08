const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./src/config/config');
const { TTLMap } = require('./src/utils/cache');
const { initModelStats } = require('./src/services/gemini.service');
const { isAdmin, getUserRole } = require('./src/utils/auth.util');
const { detectIntent, extractParameters, INTENTS } = require('./src/services/intent.service');
const { initPersistence } = require('./src/utils/persistence');

// 🔥 IMPORT ALL HANDLERS
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

// Initialize client
const client = new Client({
  authStrategy: new LocalAuth()
});

// Global state
let botReadyTimestamp = null;
const optimizedCache = new TTLMap(3600000);
const busyUsers = new Set();
const deleteConfirmations = new Map();

// 🔥 SHARED STATE - EXPOSE GLOBALLY untuk handlers
global.deleteConfirmations = deleteConfirmations;
global.busyUsers = busyUsers;
global.optimizedCache = optimizedCache;

// Event handlers
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('📱 Scan QR Code...');
});

client.on('ready', () => {
  botReadyTimestamp = Math.floor(Date.now() / 1000) + 5;
  initPersistence(); // Initialize file-based persistence
  initModelStats();
  console.log('\n✅ ULTRA ROBUST SPREADSHEET BOT READY!');
  console.log(`📊 API: ${config.spreadsheetWebAppUrl ? '✅ OK' : '❌ .env missing'}`);
  console.log(`💬 Prefix: ${REQUIRE_PREFIX ? `🔒 ON (use "${BOT_PREFIX}" to trigger)` : '🔓 OFF (all messages processed)'}`);
  console.log(`📂 Data Storage: File-based (data/ folder) with per-user isolation`);
});

// Bot configuration
const BOT_PREFIX = '!'; // Prefix untuk trigger bot (contoh: !lihat projects)
const REQUIRE_PREFIX = true; // Set false jika ingin process semua message

client.on('message', async (message) => {
  if (!botReadyTimestamp || message.timestamp < botReadyTimestamp) return;

  const userId = message.from;
  if (busyUsers.has(userId)) return;

  // 🔥 CHECK PREFIX - Only process messages starting with !
  if (REQUIRE_PREFIX && !message.body.startsWith(BOT_PREFIX)) {
    // Ignore messages without prefix
    return;
  }

  // Remove prefix dari message untuk processing
  let messageBody = message.body;
  if (messageBody.startsWith(BOT_PREFIX)) {
    messageBody = messageBody.substring(BOT_PREFIX.length).trim();
  }

  // 🔥 SMART COMMAND ROUTING dengan AI Intent Detection
  const pendingAction = deleteConfirmations.get(userId)?.action;

  try {
    // Extract context dari message (gunakan messageBody tanpa prefix)
    const { query, replyContext } = await extractQuery({ ...message, body: messageBody });
    
    // 🧠 Detect intent dengan AI
    console.log('🧠 Detecting user intent...');
    const { intent, confidence, parameters, topic } = await detectIntent(query, replyContext);
    
    console.log(`✨ Intent: ${intent} | Confidence: ${confidence}`);
    
    // ========== INTENT-BASED ROUTING ==========
    
    // 🔒 PROJECT-RELATED INTENTS (Admin only)
    if ([INTENTS.ADD_PROJECT, INTENTS.EDIT_PROJECT, INTENTS.CONFIRM_PROJECT, INTENTS.CANCEL_PROJECT].includes(intent)) {
      if (!isAdmin(userId)) {
        const userRole = getUserRole(userId);
        return message.reply(`🔒 Hanya admin yang bisa manage projects.\n👤 Role anda: ${userRole}`);
      }
    }
    
    // ADD_PROJECT Intent
    if (intent === INTENTS.ADD_PROJECT) {
      console.log('🔥 ADD PROJECT INTENT TRIGGERED!');
      return handleAddProject(message, userId, busyUsers);
    }
    
    // EDIT_PROJECT Intent
    if (intent === INTENTS.EDIT_PROJECT) {
      console.log('🔧 EDIT PROJECT INTENT TRIGGERED!');
      if (pendingAction === 'addproject') {
        return handleEditProject(message, userId, busyUsers);
      }
      return message.reply('❌ Edit apa? Gunakan `.addproject` dulu atau tambah project baru.');
    }
    
    // SHOW_PROJECT Intent
    if (intent === INTENTS.SHOW_PROJECT) {
      console.log('👀 SHOW PROJECT INTENT TRIGGERED!');
      if (pendingAction === 'addproject') {
        return handleShowProject(message, userId);
      }
      return message.reply('❌ Show apa? Gunakan `.addproject` dulu atau tambah project baru.');
    }
    
    // CONFIRM_PROJECT Intent
    if (intent === INTENTS.CONFIRM_PROJECT) {
      console.log('✅ CONFIRM PROJECT INTENT TRIGGERED!');
      if (pendingAction === 'addproject') {
        return handleConfirmProject(message, userId, busyUsers);
      }
      return message.reply('❌ Tidak ada aksi pending. Tambah project dulu dengan menyebutkan project baru.');
    }
    
    // CANCEL_PROJECT Intent
    if (intent === INTENTS.CANCEL_PROJECT) {
      console.log('❌ CANCEL PROJECT INTENT TRIGGERED!');
      if (pendingAction === 'addproject') {
        return handleCancelProject(message, userId);
      }
      return message.reply('❌ Tidak ada aksi yang dibatalkan.');
    }
    
    // CLEAR_MEMORY Intent
    if (intent === INTENTS.CLEAR_MEMORY) {
      console.log('🗑️ CLEAR MEMORY INTENT TRIGGERED!');
      return handleClearCommand(message, userId);
    }
    
    // SHOW_SHEETS Intent
    if (intent === INTENTS.SHOW_SHEETS) {
      console.log('📊 SHOW SHEETS INTENT TRIGGERED!');
      return handleSheetsCommand(message);
    }
    
    // SHOW_MEMORY Intent
    if (intent === INTENTS.SHOW_MEMORY) {
      console.log('🧠 SHOW MEMORY INTENT TRIGGERED!');
      if (topic) {
        console.log(`📌 Topic requested: ${topic}`);
      }
      return handleMemoryCommand(message, userId, topic);
    }
    
    // SHOW_MODELS Intent
    if (intent === INTENTS.SHOW_MODELS) {
      console.log('🤖 SHOW MODELS INTENT TRIGGERED!');
      return handleModelsCommand(message);
    }
    
    // SHOW_STORAGE Intent
    if (intent === INTENTS.SHOW_STORAGE) {
      console.log('📂 SHOW STORAGE INTENT TRIGGERED!');
      return handleStorageCommand(message, userId);
    }
    
    // SHOW_KANTONGSAKU Intent (ADMIN ONLY)
    if (intent === INTENTS.SHOW_KANTONGSAKU) {
      console.log('💰 SHOW KANTONGSAKU INTENT TRIGGERED!');
      return handleShowKantongSaku(message, userId);
    }
        // HELP Intent
    if (intent === INTENTS.HELP) {
      console.log('❓ HELP INTENT TRIGGERED!');
      const userRole = getUserRole(userId);
      const isAdminUser = isAdmin(userId);
      
      let helpText = `🤖 **SPREADSHEET BOT HELP** v2.0\n`;
      helpText += `👤 Role: ${userRole.toUpperCase()}\n\n`;
      
      if (isAdminUser) {
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
      
      return message.reply(helpText);
    }
    
    // DEFAULT: CHAT Intent
    if (intent === INTENTS.CHAT) {
      console.log('💬 NORMAL CHAT INTENT');
      busyUsers.add(userId);
      
      try {
        if (!query.trim()) {
          await message.reply('💡 Tanyakan apapun ke saya!\nContoh: "lihat Projects", "data apa saja"');
          return;
        }

        const cacheKey = query + (replyContext ? '|' + replyContext.substring(0,50) : '');
        const cached = optimizedCache.get(cacheKey);
        if (cached) {
          console.log('📦 Cache HIT - returning cached response');
          await message.reply(cached);
          return;
        }

        let imageData = null;
        if (message.hasMedia) {
          const media = await message.downloadMedia().catch(() => null);
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
        await message.reply(response.trim());
        
      } catch (error) {
        console.error('❌ CHAT ERROR:', error.message);
        console.error('Stack trace:', error.stack);
        await message.reply('⚠️ Error teknis. Coba lagi dalam beberapa saat.');
      } finally {
        busyUsers.delete(userId);
      }
    }
    
  } catch (error) {
    console.error('❌ MESSAGE HANDLER ERROR:', error);
    await message.reply('⚠️ Terjadi error. Coba lagi atau hubungi admin.');
  }
});

client.on('error', (error) => {
  console.error('❌ WhatsApp Error:', error);
});

client.initialize();