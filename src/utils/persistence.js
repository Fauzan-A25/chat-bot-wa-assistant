const fs = require('fs');
const path = require('path');

// Folder untuk menyimpan data per-user
const DATA_DIR = path.join(__dirname, '../../data');
const USER_DATA_DIR = path.join(DATA_DIR, 'users');

// Ensure directories exist
function ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log('✅ Created data directory');
    }
    if (!fs.existsSync(USER_DATA_DIR)) {
        fs.mkdirSync(USER_DATA_DIR, { recursive: true });
        console.log('✅ Created user data directory');
    }
}

// Get user folder (sanitize userId untuk safe filename)
function getUserDataPath(userId) {
    const sanitized = userId.replace(/[^a-zA-Z0-9]/g, '_');
    return path.join(USER_DATA_DIR, sanitized);
}

// Get file path untuk setiap data type
function getDataFilePath(userId, dataType) {
    const userPath = getUserDataPath(userId);
    return path.join(userPath, `${dataType}.json`);
}

// Load data dari file
function loadFromFile(userId, dataType) {
    try {
        const filePath = getDataFilePath(userId, dataType);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn(`⚠️ Failed to load ${dataType} for ${userId}:`, error.message);
    }
    return null;
}

// Save data ke file
function saveToFile(userId, dataType, data) {
    try {
        const userPath = getUserDataPath(userId);
        if (!fs.existsSync(userPath)) {
            fs.mkdirSync(userPath, { recursive: true });
        }
        
        const filePath = getDataFilePath(userId, dataType);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`💾 Saved ${dataType} for ${userId.substring(0, 15)}...`);
    } catch (error) {
        console.error(`❌ Failed to save ${dataType} for ${userId}:`, error.message);
    }
}

// Load all user data
function loadAllUserData(userId) {
    const shortId = userId.substring(0, 15) + '...';
    console.log(`📂 Loading data for user: ${shortId}`);
    
    const memory = loadFromFile(userId, 'memory');
    const recentChats = loadFromFile(userId, 'recent_chats');
    const summaries = loadFromFile(userId, 'summaries');
    
    // Log what was loaded
    if (memory) console.log(`   ✅ Memory loaded: ${memory.profile ? 'Has profile' : 'No profile'}`);
    if (recentChats && recentChats.length > 0) console.log(`   ✅ Recent chats: ${recentChats.length}`);
    if (summaries && summaries.length > 0) console.log(`   ✅ Summaries: ${summaries.length}`);
    
    return {
        memory: memory || null,
        recentChats: recentChats || [],
        summaries: summaries || []
    };
}

// Save all user data
function saveAllUserData(userId, memory, recentChats, summaries) {
    saveToFile(userId, 'memory', memory);
    saveToFile(userId, 'recent_chats', recentChats);
    saveToFile(userId, 'summaries', summaries);
}

// Clear user data
function clearUserData(userId) {
    try {
        const userPath = getUserDataPath(userId);
        if (fs.existsSync(userPath)) {
            fs.rmSync(userPath, { recursive: true, force: true });
            console.log(`🗑️ Cleared data for ${userId.substring(0, 15)}...`);
        }
    } catch (error) {
        console.error(`❌ Failed to clear data for ${userId}:`, error.message);
    }
}

// Get user storage stats
function getUserStorageStats(userId) {
    try {
        const userPath = getUserDataPath(userId);
        if (!fs.existsSync(userPath)) {
            return null;
        }
        
        const files = fs.readdirSync(userPath);
        const stats = {};
        let totalSize = 0;
        
        files.forEach(file => {
            const filePath = path.join(userPath, file);
            const fileStats = fs.statSync(filePath);
            stats[file] = fileStats.size;
            totalSize += fileStats.size;
        });
        
        return {
            files: stats,
            totalSize: totalSize,
            formattedSize: formatBytes(totalSize)
        };
    } catch (error) {
        console.error('❌ Failed to get storage stats:', error.message);
        return null;
    }
}

// Format bytes to readable format
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Initialize persistence system
function initPersistence() {
    ensureDirectories();
    console.log(`📂 Data directory: ${USER_DATA_DIR}`);
}

module.exports = {
    initPersistence,
    loadFromFile,
    saveToFile,
    loadAllUserData,
    saveAllUserData,
    clearUserData,
    getUserStorageStats,
    getUserDataPath,
    getDataFilePath
};
