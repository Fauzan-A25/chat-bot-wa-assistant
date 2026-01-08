require('dotenv').config();

// ✅ Better parsing untuk ADMIN_IDS (handle newlines, spaces, etc)
function parseAdminIds() {
    const rawIds = process.env.ADMIN_IDS || '';
    
    if (!rawIds.trim()) {
        return [];
    }
    
    // Split by comma, semicolon, atau newline
    const adminList = rawIds
        .split(/[,;\n]/g)
        .map(id => {
            // Remove all non-digits
            const cleaned = id.trim().replace(/[^0-9]/g, '');
            return cleaned;
        })
        .filter(id => id.length > 0); // Filter out empty entries
    
    return adminList;
}

module.exports = {
    geminiApiKey: process.env.GEMINI_API_KEY,
    spreadsheetWebAppUrl: process.env.SPREADSHEET_WEBAPP_URL || '',
    // ✅ Use better parsing function
    adminList: parseAdminIds(),
    
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
        
        // Debug: log raw ADMIN_IDS untuk troubleshooting
        console.log(`\n🔐 ===== AUTHENTICATION CONFIG =====`);
        console.log(`📋 Raw ADMIN_IDS from .env: "${process.env.ADMIN_IDS || '[EMPTY]'}"`);
        console.log(`📊 Parsed admin list:`, this.adminList);
        console.log(`✅ Total admins: ${this.adminList.length}`);
        
        if (this.adminList.length === 0) {
            console.warn('⚠️ ADMIN_IDS kosong di .env - tidak ada admin yang terdaftar');
        } else {
            console.log(`✅ Admins: ${this.adminList.join(', ')}`);
        }
        console.log(`🔐 ==================================\n`);
    }
    }
};
