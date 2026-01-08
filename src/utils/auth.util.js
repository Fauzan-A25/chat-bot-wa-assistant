const config = require('../config/config');

/**
 * Check if user is admin
 * ✅ UPDATED: Extract phone number and compare (works on WhatsApp Web, Mobile, Baileys)
 * Handles different formats: @c.us, @s.whatsapp.net, and raw numbers
 * @param {string} userId - WhatsApp user ID (format: 6281234567890@c.us or 6281234567890@s.whatsapp.net)
 * @returns {boolean}
 */
function isAdmin(userId) {
    if (!userId || config.adminList.length === 0) {
        if (config.adminList.length === 0) {
            console.log(`⚠️ Auth check: adminList EMPTY`);
        }
        return false;
    }
    
    // Extract phone number - handle multiple formats
    // Remove all non-digits to get pure phone number
    const userPhone = String(userId).replace(/[^0-9]/g, '');
    
    // Debug logging with format detection
    let formatDetected = 'unknown';
    if (userId.includes('@c.us')) formatDetected = '@c.us (WhatsApp Web)';
    else if (userId.includes('@s.whatsapp.net')) formatDetected = '@s.whatsapp.net (Baileys/Mobile)';
    else if (userId.includes('@g.us')) formatDetected = '@g.us (Group)';
    
    console.log(`\n🔐 ===== AUTH CHECK START =====`);
    console.log(`📌 Raw userId: "${userId}"`);
    console.log(`📌 Format Detected: ${formatDetected}`);
    console.log(`📌 Extracted Phone: "${userPhone}" (length: ${userPhone.length})`);
    console.log(`📌 Admin List from .env:`, config.adminList);
    console.log(`📌 Admin List details:`, config.adminList.map((phone, i) => {
        const cleaned = String(phone).replace(/[^0-9]/g, '');
        return `[${i}] "${phone}" → cleaned: "${cleaned}" (len: ${cleaned.length})`;
    }));
    
    // Compare extracted phone with admin list
    let isAdminUser = false;
    let matchedAdmin = null;
    
    for (let i = 0; i < config.adminList.length; i++) {
        const adminPhone = config.adminList[i];
        const adminPhoneStr = String(adminPhone).replace(/[^0-9]/g, '');
        const isMatch = userPhone === adminPhoneStr;
        
        console.log(`   Comparing [${i}]: "${userPhone}" (user) === "${adminPhoneStr}" (admin) → ${isMatch}`);
        
        if (isMatch) {
            isAdminUser = true;
            matchedAdmin = adminPhone;
            console.log(`   ✅ MATCH FOUND at index ${i}`);
            break;
        }
    }
    
    console.log(`\n📊 Result: ${isAdminUser ? '✅ ADMIN' : '❌ NOT ADMIN'}`);
    if (matchedAdmin) console.log(`   Matched with: "${matchedAdmin}"`);
    console.log(`🔐 ===== AUTH CHECK END =====\n`);
    
    return isAdminUser;
}

/**
 * Authorize command - throw error if user is not admin
 * @param {string} userId - WhatsApp user ID
 * @param {string} command - Command name for logging
 * @throws {Error} If user is not admin
 */
function requireAdmin(userId, command = 'command') {
    if (!isAdmin(userId)) {
        throw new Error(`UNAUTHORIZED: User ${userId} tidak memiliki akses ke ${command}`);
    }
}

/**
 * Get user role
 * @param {string} userId - WhatsApp user ID
 * @returns {string} - 'admin' or 'user'
 */
function getUserRole(userId) {
    return isAdmin(userId) ? 'admin' : 'user';
}

module.exports = {
    isAdmin,
    requireAdmin,
    getUserRole
};
