const { parseGithubUrl, fetchGithubRepo, fetchGithubReadme } = require('../services/github.service');
const { addProjectToSheet } = require('../services/spreadsheet.service');
const { generateWithFallback } = require('../services/gemini.service');
const { extractProjectInfo, formatProjectPreview, showEditableFields, parseEditValue } = require('../models/project.model');

const deleteConfirmations = new Map();

async function handleAddProject(message, userId, busyUsers) {
    busyUsers.add(userId);
    
    try {
        const parts = message.body.split(' ');
        
        if (parts.length < 2) {
            await message.reply('❌ Format: `.addproject [github_url]`\n\nContoh: `.addproject https://github.com/username/repo`');
            return;
        }
        
        const githubUrl = parts[1];
        const parsed = parseGithubUrl(githubUrl);
        
        if (!parsed) {
            await message.reply('❌ URL GitHub tidak valid!\n\nContoh valid: `https://github.com/username/repo`');
            return;
        }
        
        await message.reply(`🔄 Mengambil data dari GitHub...\n📦 Repo: ${parsed.owner}/${parsed.repo}`);
        
        console.log(`📡 Fetching: ${parsed.owner}/${parsed.repo}`);
        const repoData = await fetchGithubRepo(parsed.owner, parsed.repo);
        
        console.log('📖 Fetching README...');
        const readme = await fetchGithubReadme(parsed.owner, parsed.repo);
        
        await message.reply(`✅ Data fetched!\n🤖 Ekstrak info dengan AI...`);
        
        console.log('🤖 Extracting project info with AI...');
        const projectInfo = await extractProjectInfo(repoData, readme, generateWithFallback);
        
        console.log('📊 Project Info:', JSON.stringify(projectInfo, null, 2));
        
        const preview = formatProjectPreview(projectInfo);
        await message.reply(preview);
        
        deleteConfirmations.set(userId, {
            action: 'addproject',
            data: projectInfo,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Add project error:', error);
        await message.reply(`⚠️ Error: ${error.message}\n\nPastikan:\n1. URL GitHub valid\n2. Repository public\n3. Ada README.md`);
    } finally {
        busyUsers.delete(userId);
    }
}

async function handleEditProject(message, userId, busyUsers) {
    const pending = deleteConfirmations.get(userId);
    
    if (!pending || pending.action !== 'addproject') {
        await message.reply('❌ Tidak ada project pending. Gunakan `.addproject [url]` dulu.');
        return;
    }
    
    if (Date.now() - pending.timestamp > 300000) {
        deleteConfirmations.delete(userId);
        await message.reply('❌ Session expired (>5 menit). Coba lagi dengan `.addproject`');
        return;
    }
    
    busyUsers.add(userId);
    
    try {
        const text = message.body.substring(6);
        const firstSpace = text.indexOf(' ');
        
        if (firstSpace === -1) {
            await message.reply('❌ Format: `.edit [field] [value]`\n\nContoh: `.edit title My New Title`\n\nGunakan `.show` untuk lihat field yang tersedia.');
            return;
        }
        
        const field = text.substring(0, firstSpace).trim();
        const value = text.substring(firstSpace + 1).trim();
        
        const validFields = [
            'title', 'slug', 'shortDescription', 'description', 
            'tags', 'technologies', 'features', 'category', 
            'status', 'year', 'duration', 'role', 'teamSize',
            'demoUrl', 'videoUrl', 'featured', 'highlights'
        ];
        
        if (!validFields.includes(field)) {
            await message.reply(`❌ Field "${field}" tidak valid!\n\n✅ Field yang tersedia:\n${validFields.join(', ')}\n\nGunakan \`.show\` untuk detail.`);
            return;
        }
        
        const parsedValue = parseEditValue(field, value, pending.data);
        pending.data[field] = parsedValue;
        
        if (field === 'title') {
            const { generateSlug } = require('../models/project.model');
            pending.data.slug = generateSlug(parsedValue);
        }
        
        pending.timestamp = Date.now();
        deleteConfirmations.set(userId, pending);
        
        await message.reply(`✅ Field "${field}" updated!\n\n**New value:** ${typeof parsedValue === 'object' ? JSON.stringify(parsedValue) : parsedValue}\n\nGunakan \`.show\` untuk review atau \`.confirm\` untuk simpan.`);
        
    } catch (error) {
        console.error('❌ Edit error:', error);
        await message.reply(`⚠️ Error edit: ${error.message}`);
    } finally {
        busyUsers.delete(userId);
    }
}

async function handleShowProject(message, userId) {
    const pending = deleteConfirmations.get(userId);
    
    if (!pending || pending.action !== 'addproject') {
        await message.reply('❌ Tidak ada project pending.');
        return;
    }
    
    const details = showEditableFields(pending.data);
    await message.reply(details);
}

async function handleConfirmProject(message, userId, busyUsers) {
    const pending = deleteConfirmations.get(userId);
    
    if (!pending) {
        await message.reply('❌ Tidak ada aksi pending. Gunakan `.addproject [url]` dulu.');
        return;
    }
    
    if (Date.now() - pending.timestamp > 300000) {
        deleteConfirmations.delete(userId);
        await message.reply('❌ Konfirmasi expired (>5 menit). Coba lagi.');
        return;
    }
    
    busyUsers.add(userId);
    
    try {
        if (pending.action === 'addproject') {
            await message.reply('💾 Menyimpan ke Google Sheets...');
            
            const result = await addProjectToSheet(pending.data);
            
            if (result.success) {
                await message.reply(`✅ PROJECT BERHASIL DITAMBAHKAN!\n\n📊 Sheet: ${result.sheet}\n🆔 ID: ${result.created[0]}\n\n✨ Project "${pending.data.title}" sudah tersimpan!`);
            } else {
                await message.reply(`❌ Gagal simpan: ${result.error}`);
            }
            
            deleteConfirmations.delete(userId);
        }
    } catch (error) {
        console.error('❌ Confirm error:', error);
        await message.reply('⚠️ Error saat menyimpan');
    } finally {
        busyUsers.delete(userId);
    }
}

async function handleCancelProject(message, userId) {
    const pending = deleteConfirmations.get(userId);
    
    if (!pending) {
        await message.reply('❌ Tidak ada aksi pending.');
        return;
    }
    
    deleteConfirmations.delete(userId);
    await message.reply('✅ Aksi dibatalkan.');
}

module.exports = {
    handleAddProject,
    handleEditProject,
    handleShowProject,
    handleConfirmProject,
    handleCancelProject
};
