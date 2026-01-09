const { generateWithFallback } = require('../services/gemini.service');
const { loadAllUserData, saveAllUserData } = require('../utils/persistence');

// In-memory cache (untuk performa, data actual disimpan di file)
const userMemories = new Map();
const summaries = new Map();
const recentChats = new Map();

function initUserMemory(userId) {
    // Jika belum ada di RAM, load dari file
    if (!userMemories.has(userId)) {
        console.log(`🔄 Loading memory for ${userId.substring(0, 15)}... from file`);
        const { memory, recentChats: chats, summaries: sums } = loadAllUserData(userId);
        
        // Set default jika belum ada
        userMemories.set(userId, memory || { profile: '', preferences: '', lastUpdated: Date.now() });
        recentChats.set(userId, chats || []);
        summaries.set(userId, sums || []);
        
        console.log(`✅ Memory initialized for ${userId.substring(0, 15)}...`);
        console.log(`   📊 Recent chats: ${(chats || []).length}, Summaries: ${(sums || []).length}`);
    }
}

async function addToRecentChat(userId, role, text) {
    initUserMemory(userId);
    const recent = recentChats.get(userId) || [];
    
    // ✅ Format konsisten dengan formatChatHistory()
    recent.push({
        role: role,
        content: text
    });
    
    if (recent.length > 4) {
        const overflow = recent.splice(0, recent.length - 4);
        await summarizeOldMessages(userId, overflow).catch(console.error);
    }

    recentChats.set(userId, recent);
    
    // 💾 AUTO-SAVE ke file (async, jangan await agar tidak block)
    saveAllUserData(userId, userMemories.get(userId), recent, summaries.get(userId));
    
    console.log(`💬 [${userId.substring(0, 15)}...] Recent: ${recent.length} pesan`);
}

async function summarizeOldMessages(userId, messages) {
    if (messages.length < 2) return;

    const transcript = messages.map(m => 
        `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content || ''}`
    ).join('\n');

    try {
        console.log(`\n📝 [${userId.substring(0, 15)}...] Summarizing...`);
        const result = await generateWithFallback({
            contents: `Ringkas percakapan ini dalam 1-2 kalimat saja. Fokus pada inti topik:\n\n${transcript}\n\nRingkasan singkat:`
        }, 'summary');

        const summary = result.text.trim();
        const sums = summaries.get(userId) || [];

        sums.push({
            timestamp: Date.now(),
            summary: summary,
            modelUsed: result.modelUsed,
            modelCost: result.modelCost
        });

        summaries.set(userId, sums);

        if (sums.length > 5) {
            sums.shift();
        }

        // 💾 AUTO-SAVE summaries ke file
        saveAllUserData(userId, userMemories.get(userId), recentChats.get(userId), sums);

        console.log(`✅ Summary: "${summary.substring(0, 50)}..." [${result.modelUsed}]`);
    } catch (error) {
        console.error('❌ Summarization failed:', error.message);
    }
}

function buildSystemPrompt(memory, sums) {
    let prompt = `🤖 IDENTITAS:
Kamu adalah *Fauzan_AI*, asisten digital pribadi milik Fauzan Ahsanudin Alfikri.

🎯 TUGAS UTAMA:
Membantu user mengenal lebih dalam tentang profil, portofolio, keahlian, dan pengalaman Fauzan dengan jawaban yang natural dan helpful.

💬 PERSONALITY:
• Ramah dan conversational (kayak ngobrol sama teman)
• Pakai bahasa Indonesia sehari-hari, jangan kaku
• Emoji secukupnya (jangan berlebihan)
• Berbicara TENTANG Fauzan (dia/Fauzan), bukan SEBAGAI Fauzan
• Sapa dengan natural, jangan langsung info dump

📊 INFORMASI YANG KAMU MILIKI:
• Profil & biodata Fauzan
• Portfolio project yang pernah dibuat
• Keahlian teknis & tools yang dikuasai
• Pengalaman kerja & organisasi
• Riwayat pendidikan
• Sertifikat & achievement
• Kontak & media sosial

⚠️ ATURAN PENTING:
1. Jawab berdasarkan data yang KAMU MILIKI - jangan tebak/hallucinate!
2. Berikan jawaban yang natural - seolah-olah Anda tahu informasi ini
3. Sapa user dulu sebelum kasih info (kecuali mereka langsung minta data)
4. Format pesan untuk WhatsApp (pakai *bold*, _italic_, line breaks)
5. Jawab singkat & jelas, jangan terlalu panjang
6. ⭐ PENTING: Jangan pernah mention "tools", "spreadsheet", "sheet", atau "data source" - jawab natural saja!

📝 CONTOH PERCAKAPAN:

User: "hai"
Kamu: "Hai! 👋 Aku *Fauzan_AI*, asisten digital yang siap bantu kamu kenal lebih dekat sama Fauzan.

Fauzan itu seorang Data Science Student di Telkom University yang passionate di bidang AI & Full-Stack Development.

Mau tau apa nih? Project-projectnya, skills yang dikuasai, atau pengalaman kerjanya? 😊"

User: "project apa aja yang pernah dibuat?"
Kamu: [akses read_sheet("Projects")] 
"Fauzan punya beberapa project keren nih! 🚀

*Projects:*
1. Melodia - Music Streaming App
2. Credit Default Prediction
3. [data lainnya dari sheet]

Mau tau detail salah satu projectnya?"

User: "skill apa yang dikuasai?"
Kamu: [akses read_sheet("Skills")]
"Fauzan menguasai berbagai skill teknis seperti:

💻 *Frontend:* React, JavaScript, HTML/CSS
⚙️ *Backend:* Spring Boot, Node.js
🤖 *Data Science:* Python, Pandas, Scikit-learn
🗄️ *Database:* MySQL, PostgreSQL

Mau tau lebih detail tentang salah satu skill ini?"`;

    // Tambahkan user memory jika ada
    if (memory?.profile) {
        prompt += `\n\n👤 INFO USER:\n${memory.profile}`;
    }
    
    // Tambahkan summary percakapan sebelumnya
    const safeSums = Array.isArray(sums) ? sums.slice(-3) : [];
    if (safeSums.length > 0) {
        const recentSummaries = safeSums.map(s => s.summary || '').filter(Boolean).join('\n• ');
        if (recentSummaries) {
            prompt += `\n\n💭 KONTEKS PERCAKAPAN SEBELUMNYA:\n• ${recentSummaries}`;
        }
    }
    
    // Anti-hallucination reminder
    prompt += `\n\n🚨 CRITICAL RULES:
• User tanya data → PAKSA pakai tools (read_sheet/list_sheets)
• JANGAN jawab data dari ingatan/asumsi
• Kalau unsure sheet mana → tanya user atau list_sheets() dulu
• Format pesan untuk WhatsApp (line breaks, bold, emoji minimal)`;
    
    return prompt;
}

function getUserMemory(userId) {
    return userMemories.get(userId);
}

function getRecentChats(userId) {
    return recentChats.get(userId) || [];
}

function getSummaries(userId) {
    return summaries.get(userId) || [];
}

function clearUserMemory(userId) {
    userMemories.delete(userId);
    recentChats.delete(userId);
    summaries.delete(userId);
    
    // 🗑️ Hapus juga dari file
    const { clearUserData } = require('../utils/persistence');
    clearUserData(userId);
}

module.exports = {
    initUserMemory,
    addToRecentChat,
    summarizeOldMessages,
    buildSystemPrompt,
    getUserMemory,
    getRecentChats,
    getSummaries,
    clearUserMemory
};
