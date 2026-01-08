require('dotenv').config();

module.exports = {
    geminiApiKey: process.env.GEMINI_API_KEY,
    spreadsheetWebAppUrl: process.env.SPREADSHEET_WEBAPP_URL || '',
    adminList: (process.env.ADMIN_IDS || '').split(',').filter(id => id.trim()),
    
    // Bot settings
    botSettings: {
        maxRetries: 3,
        baseDelay: 1000,
        lockTimeout: 5000,
        cacheTimeout: 3600000,
        messageTTL: 300000 // 5 minutes
    },
    
    // Validation
    validate() {
        if (!this.geminiApiKey) {
            throw new Error('GEMINI_API_KEY tidak ditemukan di .env');
        }
        if (this.adminList.length === 0) {
            console.warn('⚠️ ADMIN_IDS kosong di .env - tidak ada admin yang terdaftar');
        } else {
            console.log(`✅ Admin terdeteksi: ${this.adminList.length} user`);
        }
    }
};
