const { getKantongSakuData } = require('../services/spreadsheet.service');

async function handleShowKantongSaku(message, userId) {
    try {
        console.log('💰 Fetching KantongSaku data...');
        const result = await getKantongSakuData(userId);
        
        if (!result.success) {
            console.log('❌ KantongSaku access denied or error:', result.error);
            return message.reply(result.message || `🔒 ${result.error}`);
        }

        console.log(`✅ KantongSaku data fetched (${result.count} records)`);
        return message.reply(result.message);
        
    } catch (error) {
        console.error('❌ KantongSaku handler error:', error.message);
        return message.reply('⚠️ Error mengakses Kantong Saku. Coba lagi nanti.');
    }
}

module.exports = {
    handleShowKantongSaku
};
