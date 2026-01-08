const { generateWithFallback } = require('./gemini.service');

/**
 * Intent types
 */
const INTENTS = {
    ADD_PROJECT: 'ADD_PROJECT',
    EDIT_PROJECT: 'EDIT_PROJECT',
    SHOW_PROJECT: 'SHOW_PROJECT',
    CONFIRM_PROJECT: 'CONFIRM_PROJECT',
    CANCEL_PROJECT: 'CANCEL_PROJECT',
    CLEAR_MEMORY: 'CLEAR_MEMORY',
    SHOW_SHEETS: 'SHOW_SHEETS',
    SHOW_MEMORY: 'SHOW_MEMORY',
    SHOW_MODELS: 'SHOW_MODELS',
    SHOW_STORAGE: 'SHOW_STORAGE',
    SHOW_KANTONGSAKU: 'SHOW_KANTONGSAKU',
    HELP: 'HELP',
    CHAT: 'CHAT' // Default untuk chat normal
};

/**
 * System prompt untuk intent detection
 */
const INTENT_SYSTEM_PROMPT = `Anda adalah AI yang ahli mendeteksi intent dari pesan pengguna.

DAFTAR INTENT YANG BISA DIDETEKSI:
1. ADD_PROJECT - User ingin menambah project baru (contoh: "saya mau add project", "tambahin project baru", "project baru di github ini")
2. EDIT_PROJECT - User ingin edit project (contoh: "ubah title project", "ganti deskripsi", "edit project")
3. SHOW_PROJECT - User ingin lihat project (contoh: "lihat project apa", "show project", "project apa saja")
4. CONFIRM_PROJECT - User ingin confirm project (contoh: "konfirmasi ini", "oke deh", "lanjut")
5. CANCEL_PROJECT - User ingin cancel (contoh: "batalin", "cancel", "jangan jadi")
6. CLEAR_MEMORY - User ingin clear memory (contoh: "hapus chat history", "reset memory", "clear semua")
7. SHOW_SHEETS - User ingin lihat sheets (contoh: "lihat sheet apa", "daftar sheet", "sheets mana aja")
8. SHOW_MEMORY - User EKSPLISIT REQUEST untuk lihat memory/history command (contoh: "lihat memory", "show chat history", "memory apa", "simpanan apa", TAPI BUKAN "apa yang kita bicarakan" atau "topik apa")
9. SHOW_MODELS - User ingin lihat model info (contoh: "model apa", "info model", "models")
10. SHOW_STORAGE - User ingin lihat storage info (contoh: "storage berapa", "disk usage", "storage stats")
11. SHOW_KANTONGSAKU - User ingin lihat kantong saku/pengeluaran (ADMIN ONLY) (contoh: "lihat kantong saku", "kantong saku berapa", "pengeluaran berapa", "expense report")
12. HELP - User minta bantuan (contoh: "help", "cara pakai", "apa aja command")
13. CHAT - Normal chat/query (contoh: pertanyaan apapun, percakapan biasa, TERMASUK "apa aja yang kita bicarakan", "topik apa yang dibahas" - yang akan dijawab pakai history sebagai context)

⭐ PENTING UNTUK SHOW_KANTONGSAKU:
- Hanya admin yang bisa akses (akan di-check oleh bot)
- User biasa akan mendapat pesan "not authorized"
- Contoh trigger:
  - "lihat kantong saku" → SHOW_KANTONGSAKU
  - "kantong saku berapa" → SHOW_KANTONGSAKU
  - "pengeluaran bulan ini" → SHOW_KANTONGSAKU
  - "laporan uang" → SHOW_KANTONGSAKU
  - "expense" → SHOW_KANTONGSAKU

⭐ PENTING UNTUK MEMBEDAKAN SHOW_MEMORY vs CHAT:

❌ JANGAN GUNAKAN SHOW_MEMORY UNTUK:
- "apa aja yang kita bicarakan?" → ini CHAT, jawab pakai history sebagai context
- "topik apa yang kita bahas?" → ini CHAT, bukan SHOW_MEMORY command
- "tadi kita ngobrolin apa?" → ini CHAT, bukan intent query
- "kita udah obrolan apa aja?" → ini CHAT

✅ GUNAKAN SHOW_MEMORY HANYA UNTUK:
- "lihat memory" → SHOW_MEMORY (command to display stored data)
- "show chat history" → SHOW_MEMORY (command)
- "memory apa" → SHOW_MEMORY (command)
- "simpanan apa" → SHOW_MEMORY (command)

KONTEKS PENTING:
- Jika ada mention project, github, atau add/edit/update → PROJECT intent
- Jika ada "hapus", "reset", "clear" → CLEAR_MEMORY
- Jika ada "confirm", "ok", "lanjut" → CONFIRM
- Jika ada "cancel", "batalin", "ngga jadi" → CANCEL
- Jika ada "storage", "disk", "usage" → SHOW_STORAGE
- Jika ada "kantong", "pengeluaran", "uang", "expense", "dompet" → SHOW_KANTONGSAKU
- Jika ada keyword EKSPLISIT "lihat memory", "show memory", "memory apa" → SHOW_MEMORY
- Semuanya yg lain atau natural conversation → CHAT

RESPONSE FORMAT:
Respond HANYA dengan JSON (no markdown, no explanation):
{
  "intent": "INTENT_NAME",
  "confidence": 0.0-1.0,
  "parameters": {
    "url": "jika ada github url",
    "field": "jika ada field yang mau diedit",
    "value": "jika ada value baru"
  }
}`;

/**
 * Detect user intent dari message
 * @param {string} message - User message
 * @param {string} replyContext - Reply context jika ada
 * @returns {Promise<{intent: string, confidence: number, parameters: object}>}
 */
async function detectIntent(message, replyContext = '') {
    try {
        const userInput = message + (replyContext ? `\n\nReply ke: ${replyContext.substring(0, 100)}` : '');
        
        const result = await generateWithFallback({
            systemInstruction: INTENT_SYSTEM_PROMPT,
            contents: `Deteksi intent dari pesan ini:\n\n"${userInput}"`
        }, 'intent');
        
        // Parse JSON response
        const responseText = result.text.trim();
        
        // Extract JSON dari response (dalam case ada teks tambahan)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.log('⚠️ Invalid intent response format:', responseText.substring(0, 100));
            return {
                intent: INTENTS.CHAT,
                confidence: 0.5,
                parameters: {}
            };
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate confidence
        if (parsed.confidence < 0.3) {
            console.log(`📊 Low confidence (${parsed.confidence}), treating as CHAT`);
            return {
                intent: INTENTS.CHAT,
                confidence: parsed.confidence,
                parameters: parsed.parameters || {}
            };
        }
        
        console.log(`🎯 Intent detected: ${parsed.intent} (confidence: ${parsed.confidence})`);
        
        return {
            intent: parsed.intent || INTENTS.CHAT,
            confidence: parsed.confidence || 0,
            parameters: parsed.parameters || {}
        };
        
    } catch (error) {
        console.error('❌ Intent detection error:', error.message);
        // Fallback ke CHAT intent jika ada error
        return {
            intent: INTENTS.CHAT,
            confidence: 0,
            parameters: {}
        };
    }
}

/**
 * Extract parameters dari message berdasarkan intent
 * Bisa di-extend untuk intent spesifik
 */
async function extractParameters(message, intent) {
    const params = {};
    
    switch (intent) {
        case INTENTS.ADD_PROJECT:
            // Extract GitHub URL jika ada
            const urlMatch = message.match(/https?:\/\/(?:www\.)?github\.com\/[\w-]+\/[\w-]+/);
            if (urlMatch) {
                params.url = urlMatch[0];
            }
            break;
            
        case INTENTS.EDIT_PROJECT:
            // Extract field dan value dari "edit field value" pattern
            const editMatch = message.match(/edit\s+(\w+)\s+"?([^"]+)"?/i);
            if (editMatch) {
                params.field = editMatch[1];
                params.value = editMatch[2];
            }
            break;
    }
    
    return params;
}

module.exports = {
    INTENTS,
    detectIntent,
    extractParameters
};
