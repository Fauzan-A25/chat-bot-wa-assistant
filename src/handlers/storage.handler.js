const { getUserStorageStats } = require('../utils/persistence');

async function handleStorageCommand(message, userId) {
    const stats = getUserStorageStats(userId);
    
    if (!stats) {
        return message.reply('📂 No storage data found for this user yet.');
    }
    
    let statsText = `📂 **YOUR STORAGE**\n\n`;
    
    // Show individual files
    statsText += `📝 **Files:**\n`;
    Object.entries(stats.files).forEach(([file, size]) => {
        const fileType = file.replace('.json', '').toUpperCase();
        const sizeStr = size > 1024 ? (size / 1024).toFixed(2) + ' KB' : size + ' B';
        statsText += `• ${fileType}: ${sizeStr}\n`;
    });
    
    statsText += `\n💾 **Total:** ${stats.formattedSize}`;
    
    await message.reply(statsText);
}

module.exports = {
    handleStorageCommand
};
