const config = require('../config/config');

/**
 * Check if user is admin
 * ✅ UPDATED: Extract phone number and compare (works on Windows + Ubuntu/Termux)
 * @param {string} userId - WhatsApp user ID (format: 6281234567890@c.us)
 * @returns {boolean}
 */
function isAdmin(userId) {
    if (!userId || config.adminList.length === 0) {
        if (config.adminList.length === 0) {
            console.log(`⚠️ Auth check: adminList EMPTY`);
        }
        return false;
    }
    
    // Extract phone number from WhatsApp ID (remove @c.us and any non-digits)
    const userPhone = String(userId).replace(/[^0-9]/g, '');
    
    // Debug logging
    const isAdminUser = config.adminList.some(adminPhone => userPhone === adminPhone);
    
    console.log(`🔐 Auth Check:`, {
        userId: userId.substring(0, 20) + '...',
        extractedPhone: userPhone,
        adminList: config.adminList,
        isAdmin: isAdminUser
    });
    
    if (isAdminUser) {
        console.log(`✅ ADMIN VERIFIED: ${userPhone}`);
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
