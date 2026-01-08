const { getKantongSakuData } = require('../services/spreadsheet.service');

async function handleShowKantongSaku(message, userId) {
    try {
        // ✅ Auth sudah di-check di index.js - tidak perlu check lagi di sini
        console.log('💰 Fetching KantongSaku data...');
        const result = await getKantongSakuData(userId);
        
        if (!result.success) {
            console.log('❌ KantongSaku error:', result.error);
            return message.reply(result.message || `🔒 ${result.error}`);
        }

        console.log(`✅ KantongSaku data fetched (${result.count} records)`);
        
        // ✅ RETURN FORMATTED MESSAGE - JANGAN KIRIM KE GEMINI
        return message.reply(result.message);
        
    } catch (error) {
        console.error('❌ KantongSaku handler error:', error.message);
        return message.reply('⚠️ Error mengakses Kantong Saku. Coba lagi nanti.');
    }
}

module.exports = {
    handleShowKantongSaku
};
