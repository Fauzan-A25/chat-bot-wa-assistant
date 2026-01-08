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
    else if (userId.includes('@s.whatsapp.net')) formatDetected = '@s.whatsapp.net (Baileys)';
    else if (userId.includes('@g.us')) formatDetected = '@g.us (Group)';
    
    console.log(`🔐 Auth Check:`, {
        userId: userId,
        format: formatDetected,
        extractedPhone: userPhone,
        adminList: config.adminList,
        phoneLength: userPhone.length
    });
    
    // Compare extracted phone with admin list
    const isAdminUser = config.adminList.some(adminPhone => {
        const adminPhoneStr = String(adminPhone).replace(/[^0-9]/g, '');
        const isMatch = userPhone === adminPhoneStr;
        
        if (isMatch) {
            console.log(`✅ MATCHED: user phone "${userPhone}" === admin phone "${adminPhoneStr}"`);
        }
        
        return isMatch;
    });
    
    if (isAdminUser) {
        console.log(`✅ ADMIN VERIFIED: ${userPhone} (${formatDetected})`);
    } else {
        console.log(`❌ NOT ADMIN: ${userPhone} (allowed: ${config.adminList.join(', ')})`);
    }
    
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
