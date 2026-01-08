const { clearUserMemory, getUserMemory, getRecentChats, getSummaries, initUserMemory } = require('../memory/memory.service');
const { executeSpreadsheetTool } = require('../services/spreadsheet.service');
const { getModelStats } = require('../services/gemini.service');

async function handleClearCommand(message, userId) {
    clearUserMemory(userId);
    await message.reply('✅ Memory cleared!');
}

async function handleSheetsCommand(message) {
    const result = await executeSpreadsheetTool('list_sheets', {});
    await message.reply(result.success ? `📊 **Sheets:**\n${result.sheets}` : result.error);
}

async function handleMemoryCommand(message, userId) {
    // Initialize memory terlebih dahulu (load dari file jika ada)
    initUserMemory(userId);
    
    const memory = getUserMemory(userId) || {};
    const recentChats = getRecentChats(userId) || [];
    const summaries = getSummaries(userId) || [];
    
    let memoryText = `🧠 **YOUR MEMORY**\n\n`;
    
    // Profile
    memoryText += `👤 **Profile:**\n`;
    memoryText += memory.profile ? `${memory.profile}\n` : `Belum ada data profile\n`;
    
    // Recent Chats
    memoryText += `\n💬 **Recent Chats:** ${recentChats.length}\n`;
    if (recentChats.length > 0) {
        recentChats.slice(-3).forEach((chat, idx) => {
            const preview = chat.content?.substring(0, 40) || 'N/A';
            const role = chat.role === 'user' ? '👤 You' : '🤖 Bot';
            memoryText += `  ${idx + 1}. ${role}: "${preview}${chat.content?.length > 40 ? '...' : ''}"\n`;
        });
    } else {
        memoryText += `  Belum ada chat history\n`;
    }
    
    // Summaries
    memoryText += `\n📝 **Previous Conversations:** ${summaries.length}\n`;
    if (summaries.length > 0) {
        summaries.slice(-2).forEach((sum, idx) => {
            const preview = sum.summary?.substring(0, 50) || 'N/A';
            memoryText += `  ${idx + 1}. "${preview}${sum.summary?.length > 50 ? '...' : ''}"\n`;
        });
    } else {
        memoryText += `  Belum ada summary\n`;
    }
    
    // Total
    const totalChats = recentChats.length + (summaries.length * 4); // Estimasi chats yang di-summarize
    memoryText += `\n📊 **Total Conversations:** ~${totalChats} messages`;
    
    await message.reply(memoryText);
}

async function handleModelsCommand(message) {
    const stats = getModelStats();
    await message.reply(`🤖 Model Stats:\n${stats}`);
}

module.exports = {
    handleClearCommand,
    handleSheetsCommand,
    handleMemoryCommand,
    handleModelsCommand
};
