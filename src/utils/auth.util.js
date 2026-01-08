const config = require('../config/config');

/**
 * Check if user is admin
 * @param {string} userId - WhatsApp user ID (format: 6281234567890@c.us)
 * @returns {boolean}
 */
function isAdmin(userId) {
    if (!userId || config.adminList.length === 0) return false;
    
    // Extract phone number from WhatsApp ID
    const phoneNumber = userId.split('@')[0];
    
    return config.adminList.some(adminId => {
        const adminPhone = adminId.trim().replace(/[@]/g, '');
        return phoneNumber === adminPhone || userId === adminId;
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
