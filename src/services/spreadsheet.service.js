const config = require('../config/config');
const { withRetry } = require('../utils/retry.util');
const { SHEET_NAME_MAP, TOOL_TRIGGER_WORDS } = require('../config/constants');
const { isAdmin } = require('../utils/auth.util');

// ✅ NEW: Format KantongSaku data untuk WhatsApp (Summary Today Only)
function formatKantongSakuForWA(data) {
  if (!data || !data.length) {
    return '📂 Tidak ada data kantong saku.';
  }

  const TOLERANCE_LIMIT = 40000; // Batas toleransi: 40rb

  // Get today's date in format "DD MMM YYYY" or match spreadsheet format
  const today = new Date();
  const todayStr = String(today.getDate()).padStart(2, '0') + ' Jan ' + today.getFullYear();
  
  // Filter data for today only
  const todayData = data.filter(row => {
    const rowDate = row['Tanggal'] || '';
    return rowDate.toLowerCase().includes(todayStr.toLowerCase()) || 
           rowDate.includes(String(today.getDate()).padStart(2, '0'));
  });

  if (!todayData.length) {
    return `📂 Tidak ada transaksi untuk hari ini (${todayStr}).`;
  }

  // Find row with Total value (akumulatif dan otomatis update)
  let finalSaldo = 0;
  for (let i = todayData.length - 1; i >= 0; i--) {
    const totalValue = String(todayData[i]['Total'] || '').trim();
    if (totalValue && totalValue !== '' && totalValue !== '0') {
      finalSaldo = parseInt(totalValue.replace(/[^\d-]/g, '')) || 0;
      break;
    }
  }
  
  // Calculate daily expense from ALL transactions
  let dailyExpense = 0;
  let transactionCount = 0;
  todayData.forEach(row => {
    const nominal = parseFloat(String(row['Nominal'] || 0).replace(/[^\d-]/g, ''));
    if (nominal < 0) {
      dailyExpense += Math.abs(nominal);
      transactionCount++;
    }
  });

  // Check status
  const isWarning = dailyExpense > TOLERANCE_LIMIT;
  const exceeding = dailyExpense - TOLERANCE_LIMIT;
  
  // Build pretty summary
  let message = '';
  message += '╔═══════════════════════════════╗\n';
  message += '║   💰 KANTONG SAKU TODAY 💰   ║\n';
  message += '╚═══════════════════════════════╝\n\n';
  
  message += `📅 Tanggal: ${todayData[0]['Tanggal']}\n`;
  message += `🔢 Transaksi: ${transactionCount}x\n\n`;
  
  message += '─────────────────────────────────\n';
  message += `📤 Pengeluaran    : Rp${dailyExpense.toLocaleString('id-ID')}\n`;
  message += `📊 Batas Aman    : Rp${TOLERANCE_LIMIT.toLocaleString('id-ID')}\n`;
  
  if (isWarning) {
    message += `⚠️  Melebihi      : Rp${exceeding.toLocaleString('id-ID')}\n`;
    message += `🔴 Status        : WARNING\n`;
  } else {
    const remaining = TOLERANCE_LIMIT - dailyExpense;
    message += `✅ Sisa Toleransi: Rp${remaining.toLocaleString('id-ID')}\n`;
    message += `🟢 Status        : AMAN\n`;
  }
  
  message += '─────────────────────────────────\n';
  message += `💰 Saldo Akhir   : Rp${finalSaldo.toLocaleString('id-ID')}\n`;
  message += '═════════════════════════════════\n';

  return message;
}

// ✅ Check admin access untuk KantongSaku
async function checkKantongSakuAccess(userId) {
  if (!isAdmin(userId)) {
    return {
      success: false,
      error: '🔒 ACCESS DENIED',
      message: 'Hanya admin yang bisa akses Kantong Saku! Hubungi admin untuk informasi pengeluaran.'
    };
  }
  return { success: true };
}

// ✅ NEW: Get KantongSaku data dengan auth check
async function getKantongSakuData(userId) {
  // Check authorization
  const authCheck = await checkKantongSakuAccess(userId);
  if (!authCheck.success) {
    return authCheck;
  }

  // Read from spreadsheet
  try {
    const data = await callSpreadsheetTool('read', { sheet: 'KantongSaku' });
    if (!data.success || !data.data?.length) {
      return { 
        success: false, 
        error: '❌ Sheet "KantongSaku" tidak ditemukan atau kosong' 
      };
    }

    const formattedData = formatKantongSakuForWA(data.data);
    return {
      success: true,
      sheet: 'KantongSaku',
      message: formattedData,
      rawData: data.data,
      count: data.data.length
    };
  } catch (error) {
    console.error('❌ Failed to get KantongSaku:', error);
    return { success: false, error: error.message };
  }
}

// ✅ NEW: Check if experience already exists
async function checkExperienceDuplicate(experienceData, sheetName = 'Experiences') {
  try {
    console.log(`🔍 Checking duplicates in ${sheetName}...`);
    
    // Read existing data
    const existingData = await callSpreadsheetTool('read', { sheet: sheetName });
    
    if (!existingData.success || !existingData.data?.length) {
      console.log('✅ Sheet kosong = no duplicates');
      return false;
    }
    
    const titleLower = (experienceData.title || '').toLowerCase().trim();
    const companyLower = (experienceData.company || '').toLowerCase().trim();
    
    console.log(`🔍 Looking for: "${titleLower}" @ "${companyLower}"`);
    
    const duplicate = existingData.data.some(row => {
      const rowTitle = (row.title || '').toLowerCase().trim();
      const rowCompany = (row.company || '').toLowerCase().trim();
      
      const titleMatch = rowTitle.includes(titleLower) || 
                        titleLower.includes(rowTitle) || 
                        rowTitle === titleLower;
                        
      const companyMatch = rowCompany.includes(companyLower) || 
                          companyLower.includes(rowCompany) ||
                          rowCompany === companyLower;
      
      const isDuplicate = titleMatch && companyMatch;
      
      if (isDuplicate) {
        console.log(`✅ DUPLICATE FOUND: "${rowTitle}" @ "${rowCompany}"`);
      }
      
      return isDuplicate;
    });
    
    return duplicate;
    
  } catch (error) {
    console.error('❌ Duplicate check failed:', error);
    return false; // Safe fallback: assume no duplicate
  }
}

// ✅ UPDATED: Generic add function (Projects + Experiences)
async function addDataToSheet(data, sheetName = 'Projects') {
  if (!config.spreadsheetWebAppUrl) {
    return { success: false, error: 'SPREADSHEET_WEBAPP_URL tidak dikonfigurasi' };
  }
  
  // ✅ DUPLICATE CHECK (untuk Experiences)
  if (sheetName === 'Experiences') {
    const isDuplicate = await checkExperienceDuplicate(data, sheetName);
    if (isDuplicate) {
      return {
        success: false,
        error: 'DUPLICATE_DETECTED',
        message: `Experience "${data.title}" di "${data.company}" sudah ada di sheet!`
      };
    }
  }
  
  try {
    console.log(`💾 Adding to ${sheetName}:`, data.title || 'No title');
    
    const response = await fetch(config.spreadsheetWebAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'create',
        sheet: sheetName,
        data: data
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`✅ Added to ${sheetName}:`, result.created?.[0]);
    
    return {
      success: true,
      sheet: sheetName,
      ...result
    };
    
  } catch (error) {
    console.error(`❌ Add to ${sheetName} failed:`, error);
    return { success: false, error: error.message };
  }
}

// ✅ BACKWARDS COMPATIBLE: Keep old function
async function addProjectToSheet(projectData) {
  return addDataToSheet(projectData, 'Projects');
}

// ✅ NEW: Experiences function
async function addExperienceToSheet(experienceData) {
  return addDataToSheet(experienceData, 'Experiences');
}

async function callSpreadsheetTool(action, params = {}) {
    if (!config.spreadsheetWebAppUrl) {
        return { success: false, error: 'SPREADSHEET_WEBAPP_URL tidak dikonfigurasi di .env' };
    }
    
    return withRetry(async () => {
        let url = `${config.spreadsheetWebAppUrl}?action=${action}`;
        if (params.sheet) url += `&sheet=${encodeURIComponent(params.sheet)}`;
        if (params.id) url += `&id=${encodeURIComponent(params.id)}`;
        if (params.filter) url += `&filter=${encodeURIComponent(params.filter)}`;
        
        console.log(`🌐 API: ${url}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    }, 2);
}

async function executeSpreadsheetTool(toolName, params) {
    console.log(`🛠️ EXECUTING: ${toolName}(${JSON.stringify(params)})`);
    
    try {
        switch(toolName) {
            case 'list_sheets':
                const sheets = await callSpreadsheetTool('list');
                if (!sheets.success || !sheets.sheets?.length) {
                    return { success: false, error: '❌ Spreadsheet kosong', sheets: [], count: 0 };
                }
                return {
                    success: true,
                    sheets: sheets.sheets.map(s => `${s.name} (${s.rowCount || 0} rows)`).join('\n• '),
                    count: sheets.sheets.length,
                    details: sheets.sheets
                };
                
            case 'read_sheet':
                if (!params?.sheet_name?.trim()) {
                    return { success: false, error: '❌ sheet_name wajib (contoh: PersonalInfo)' };
                }
                const data = await callSpreadsheetTool('read', { sheet: params.sheet_name });
                if (!data.success || !data.data?.length) {
                    return { success: false, error: `❌ Sheet "${params.sheet_name}" tidak ditemukan atau kosong` };
                }
                
                const allData = data.data.slice(0, 50);
                const preview = allData.map((row, i) => 
                    `${i+1}. ${Object.entries(row).slice(0, 4).map(([k,v]) => `${k}: ${String(v).substring(0,20)}`).join(' | ')}`
                ).join('\n');
                
                return {
                    success: true,
                    sheet: params.sheet_name,
                    summary: `${data.count || data.data.length} TOTAL records (${allData.length} shown)`,
                    preview,
                    total: data.count || data.data.length,
                    all_data: allData
                };
                
            case 'get_schema':
                if (!params?.sheet_name?.trim()) {
                    return { success: false, error: '❌ sheet_name wajib' };
                }
                const schema = await callSpreadsheetTool('schema', { sheet: params.sheet_name });
                if (!schema.success || !schema.schema?.length) {
                    return { success: false, error: `❌ Struktur "${params.sheet_name}" gagal` };
                }
                const cols = schema.schema.map(c => `• ${c.column} (${c.type})`).join('\n');
                return {
                    success: true,
                    sheet: params.sheet_name,
                    columns: cols,
                    column_count: schema.schema.length
                };
                
            default:
                return { success: false, error: `❌ Tool "${toolName}" tidak dikenal` };
        }
    } catch (error) {
        console.error(`❌ Tool failed: ${error.message}`);
        return { success: false, error: `❌ ${error.message}` };
    }
}

async function addProjectToSheet(projectData) {
    if (!config.spreadsheetWebAppUrl) {
        return { success: false, error: 'SPREADSHEET_WEBAPP_URL tidak dikonfigurasi' };
    }

    try {
        const response = await fetch(config.spreadsheetWebAppUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'create',
                sheet: 'Projects',
                data: projectData
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('❌ Add to sheet failed:', error);
        return { success: false, error: error.message };
    }
}

function detectSheetName(message, replyContext = '') {
    const fullText = (message + ' ' + replyContext).toLowerCase();
    
    for (const [pattern, sheetName] of Object.entries(SHEET_NAME_MAP)) {
        if (fullText.includes(pattern)) {
            console.log(`🎯 EXACT SHEET: "${pattern}" → "${sheetName}"`);
            return sheetName;
        }
    }
    
    if (fullText.includes('personalinfo') || fullText.includes('personal info')) return 'PersonalInfo';
    if (fullText.includes('board sales officer') || fullText.includes('board sales')) return 'Board Sales Officer';
    
    return null;
}

function shouldUseTools(userMessage, replyContext = '') {
    const fullContext = (userMessage + ' ' + replyContext).toLowerCase();
    const sheetName = detectSheetName(userMessage, replyContext);
    
    if (sheetName) {
        console.log(`🔥 SHEET DETECTED: "${sheetName}"`);
        return true;
    }
    
    const hasTrigger = TOOL_TRIGGER_WORDS.some(w => fullContext.includes(w));
    const hasDataIntent = fullContext.includes('ada') || fullContext.includes('apa') || fullContext.includes('lihat');
    
    const needsTools = hasTrigger && hasDataIntent;
    console.log(`🛠️ TOOL CHECK: sheet="${sheetName}", trigger=${hasTrigger}, intent=${hasDataIntent}, TOTAL=${needsTools}`);
    return needsTools;
}

module.exports = {
  callSpreadsheetTool,
  executeSpreadsheetTool,
  addProjectToSheet,      // ✅ Keep for backwards compatibility
  addExperienceToSheet,   // ✅ NEW
  addDataToSheet,         // ✅ Generic function
  checkExperienceDuplicate, // ✅ NEW
  getKantongSakuData,     // ✅ NEW - Get KantongSaku dengan auth
  formatKantongSakuForWA, // ✅ NEW - Format untuk WhatsApp
  checkKantongSakuAccess, // ✅ NEW - Check admin access
  detectSheetName,
  shouldUseTools
};