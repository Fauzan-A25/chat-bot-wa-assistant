const config = require('../config/config');

/**
 * Check if user is admin
 * ✅ FIXED: Cross-platform compatible admin check
 * @param {string} userId - WhatsApp user ID (format: 6281234567890@c.us)
 * @returns {boolean}
 */
function isAdmin(userId) {
    if (!userId || config.adminList.length === 0) return false;
    
    // Extract phone number from WhatsApp ID (handle both with/without @c.us)
    const phoneNumber = String(userId).split('@')[0].trim();
    
    return config.adminList.some(adminId => {
        // Normalize admin ID untuk comparison
        const adminIdNorm = String(adminId).trim();
        const adminPhone = adminIdNorm.split('@')[0].trim();
        
        // Check both full ID dan phone number
        return phoneNumber === adminPhone || 
               userId === adminIdNorm || 
               userId.startsWith(adminPhone + '@');
    });
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
