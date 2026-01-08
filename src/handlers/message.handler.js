const { acquireLock, releaseLock } = require('../utils/lock.service');
const { initUserMemory, addToRecentChat, buildSystemPrompt, getUserMemory, getRecentChats, getSummaries } = require('../memory/memory.service');
const { shouldUseTools, detectSheetName, executeSpreadsheetTool } = require('../services/spreadsheet.service');
const { generateWithFallback } = require('../services/gemini.service');

async function extractQuery(message) {
    let query = message.body.replace('.bot', '').trim();
    let replyContext = '';
    
    if (message.hasQuotedMsg) {
        try {
            const quotedMsg = await message.getQuotedMessage();
            if (quotedMsg && quotedMsg.body) {
                replyContext = quotedMsg.body.substring(0, 200);
                console.log(`📝 REPLY: "${replyContext.substring(0, 50)}..."`);
            }
        } catch (e) {
            console.log('⚠️ Reply context failed');
        }
    }
    
    return { query, replyContext };
}

// Helper function untuk format chat history ke format Gemini
// OPTIMASI: Batasi max history untuk hemat token
function formatChatHistory(recentChats, maxHistory = 10) {
    if (!recentChats || recentChats.length === 0) {
        console.log('📜 No recent chats to format');
        return [];
    }
    
    console.log(`📜 Formatting history: ${recentChats.length} chats available`);
    
    // Filter out empty messages
    const validChats = recentChats.filter(chat => chat && chat.content && chat.content.trim());
    console.log(`📜 Valid chats after filtering: ${validChats.length}`);
    
    const limitedChats = validChats.slice(-maxHistory); // Ambil N terakhir
    console.log(`📜 Limited to last ${limitedChats.length} chats`);
    
    const formatted = limitedChats.map(chat => ({
        role: chat.role === 'model' ? 'model' : 'user',
        parts: [{ text: chat.content || '' }]
    }));
    
    console.log(`✅ Formatted ${formatted.length} chat entries for API`);
    return formatted;
}

async function generateResponse(userId, userMessage, isImageQuery = false, imageData = null, replyContext = '') {
    const lock = await acquireLock(userId);
    try {
        // VALIDASI: Pastikan userMessage tidak kosong
        if (!userMessage || userMessage.trim() === '') {
            console.log('⚠️ Empty user message detected');
            return 'Maaf, pesan kosong. Silakan kirim pesan yang valid.';
        }

        console.log('\n🔄 === GENERATERESPONSE START ===');
        console.log(`📌 UserId: ${userId.substring(0, 15)}...`);
        console.log(`📝 UserMessage: "${userMessage.substring(0, 50)}..."`);

        // Initialize memory structures
        initUserMemory(userId);
        console.log('✅ Memory initialized');

        // Get memory data
        const memory = getUserMemory(userId);
        const recent = getRecentChats(userId);
        const sums = getSummaries(userId);
        
        console.log('📊 Memory Stats:', {
            memoryProfile: memory?.profile ? 'Has profile' : 'No profile',
            recentChatsCount: recent?.length || 0,
            summariesCount: sums?.length || 0
        });
        
        const fullContext = userMessage + (replyContext ? `\n\n--- REPLY KE ---\n${replyContext}` : '');

        // DEBUG: Log untuk troubleshooting
        console.log('🔍 DEBUG Context:', {
            userId: userId.substring(0, 15) + '...',
            messageLength: userMessage.length,
            hasReplyContext: !!replyContext,
            recentChatsCount: recent?.length || 0,
            fullContextLength: fullContext.length
        });

        // Format history untuk Gemini API (hanya chat lampau, max 10)
        const formattedHistory = formatChatHistory(recent, 10);
        
        console.log('📜 Formatted History:', {
            totalChats: recent?.length || 0,
            formattedChats: formattedHistory.length,
            details: formattedHistory.map((h, i) => ({
                index: i,
                role: h.role,
                textLength: h.parts[0]?.text?.length || 0,
                textPreview: h.parts[0]?.text?.substring(0, 30) || 'N/A'
            }))
        });

        let responseText;

        if (shouldUseTools(userMessage, replyContext)) {
            console.log('🔥 TOOL MODE ACTIVATED');
            const sheetName = detectSheetName(userMessage, replyContext);
            let toolResult;
            
            if (sheetName) {
                console.log(`📊 Reading sheet: "${sheetName}"`);
                toolResult = await executeSpreadsheetTool('read_sheet', { sheet_name: sheetName });
            } else {
                toolResult = await executeSpreadsheetTool('list_sheets', {});
            }
            
            // OPTIMASI: Compact JSON tanpa indentasi untuk hemat token
            const toolContext = `
PERINTAH USER: "${userMessage}"
${replyContext ? `REPLY KE: "${replyContext.substring(0, 100)}..."` : ''}

📊 HASIL TOOL:
${JSON.stringify(toolResult)}

JAWAB NATURAL dengan data REAL di atas. Jangan hallucinate!
            `.trim();
            
            console.log('🔍 Tool context length:', toolContext.length);
            
            console.log('🤖 Calling generateWithFallback with history...');
            const result = await generateWithFallback({
                systemInstruction: buildSystemPrompt(memory, sums),
                history: formattedHistory,
                contents: toolContext
            });
            
            responseText = result.text;
            console.log('✅ Tool response received:', responseText.substring(0, 50) + '...');
        } else {
            console.log('💬 NORMAL CHAT MODE');
            console.log('🔍 Full context length:', fullContext.length);
            console.log('🔍 History count:', formattedHistory.length);
            
            // Build system prompt
            const systemPrompt = buildSystemPrompt(memory, sums);
            console.log('📋 System prompt length:', systemPrompt.length);
            
            // Mode normal dengan history
            console.log('🤖 Calling generateWithFallback with history...');
            const result = await generateWithFallback({
                systemInstruction: systemPrompt,
                history: formattedHistory,
                contents: fullContext
            });
            
            responseText = result.text;
            console.log('✅ Chat response received:', responseText.substring(0, 50) + '...');
        }

        // VALIDASI: Pastikan response tidak kosong
        if (!responseText || responseText.trim() === '') {
            console.log('⚠️ Empty response from AI');
            responseText = 'Maaf, terjadi kesalahan. Silakan coba lagi.';
        }
        
        // ✅ SAFETY: Truncate response jika terlalu panjang (WhatsApp has limits)
        // WhatsApp message limit: ~65K chars, tapi lebih baik limit di 4000 untuk safety
        if (responseText.length > 4000) {
            console.log(`⚠️ Response too long (${responseText.length}), truncating to 4000 chars`);
            responseText = responseText.substring(0, 3990) + '\n\n... (pesan terlalu panjang, dipotong)';
        }

        // OPTIMASI: Save chat history sekali saja di akhir
        console.log('💾 Saving bot response to recent chat...');
        await addToRecentChat(userId, 'model', responseText);
        
        console.log('✅ Response generated successfully');
        console.log('🔄 === GENERATERESPONSE END ===\n');
        return responseText;
        
    } catch (error) {
        console.error(`❌ Error generating response for ${userId}:`, error.message);
        console.error('Stack trace:', error.stack);
        
        // Return user-friendly error message
        return 'Maaf, terjadi kesalahan saat memproses pesan Anda. Silakan coba lagi dalam beberapa saat.';
    } finally {
        releaseLock(lock);
    }
}

module.exports = {
    extractQuery,
    generateResponse
};
