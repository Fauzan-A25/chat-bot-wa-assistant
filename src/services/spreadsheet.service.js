const config = require('../config/config');
const { withRetry } = require('../utils/retry.util');
const { SHEET_NAME_MAP, TOOL_TRIGGER_WORDS } = require('../config/constants');
const { isAdmin } = require('../utils/auth.util');

// ✅ Helper: Parse tanggal format - supports both ISO 8601 and "DD MMM YYYY" (OS-independent)
function parseTanggalString(tanggalStr) {
  if (!tanggalStr) return null;
  
  const strTrimmed = String(tanggalStr).trim();
  
  // Try to parse ISO 8601 format first (e.g., "2026-01-05T17:00:00.000Z")
  if (strTrimmed.includes('T') && strTrimmed.includes('Z')) {
    const isoDate = new Date(strTrimmed);
    if (!isNaN(isoDate.getTime())) {
      // Return date at midnight UTC
      return new Date(Date.UTC(isoDate.getUTCFullYear(), isoDate.getUTCMonth(), isoDate.getUTCDate()));
    }
  }
  
  const months = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
  };
  
  // Match format: "06 Jan 2026" or "6 Jan 2026"
  const match = strTrimmed.match(/^(\d{1,2})\s+([a-zA-Z]{3,})\s+(\d{4})$/);
  if (!match) {
    console.warn(`⚠️ Invalid date format: "${tanggalStr}"`);
    return null;
  }
  
  const [, day, monthStr, year] = match;
  const month = months[monthStr.toLowerCase()];
  
  if (month === undefined) {
    console.warn(`⚠️ Unknown month: "${monthStr}"`);
    return null;
  }
  
  // Create date at midnight UTC to avoid timezone issues
  const date = new Date(Date.UTC(parseInt(year), month, parseInt(day)));
  return date;
}

// ✅ Get today's date normalized
function getTodayDateOnly() {
  const today = new Date();
  // Create date at midnight UTC
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

// ✅ NEW: Format KantongSaku data untuk WhatsApp (Summary Today Only)
function formatKantongSakuForWA(data) {
  if (!data || !data.length) {
    return '📂 Tidak ada data kantong saku.';
  }

  const TOLERANCE_LIMIT = 40000; // Batas toleransi: 40rb

  const todayDateOnly = getTodayDateOnly();
  
  // Extract all valid dates from data
  const validDates = [];
  data.forEach(row => {
    const rowDateStr = String(row['Tanggal'] || '').trim();
    if (rowDateStr) {
      const rowDate = parseTanggalString(rowDateStr);
      if (rowDate) {
        validDates.push({ date: rowDate, dateStr: rowDate.toISOString() });
      }
    }
  });
  
  // Remove duplicates and sort by date descending
  const uniqueDates = [...new Map(validDates.map(item => [item.dateStr, item])).values()];
  uniqueDates.sort((a, b) => b.date.getTime() - a.date.getTime());
  
  console.log(`🔍 KantongSaku filter:`, {
    todayUTC: todayDateOnly.toISOString(),
    availableDates: uniqueDates.map(d => d.dateStr),
    latestDate: uniqueDates[0]?.dateStr
  });
  
  // Try to get today's data first, otherwise use latest available date
  let targetDate = todayDateOnly;
  let targetDateStr = `${todayDateOnly.getUTCDate().toString().padStart(2, '0')} Jan ${todayDateOnly.getUTCFullYear()}`;
  
  let todayData = data.filter(row => {
    const rowDateStr = String(row['Tanggal'] || '').trim();
    if (!rowDateStr) return false;
    
    const rowDate = parseTanggalString(rowDateStr);
    if (!rowDate) return false;
    
    return rowDate.getTime() === targetDate.getTime();
  });
  
  // If no data for today, use the latest available date
  if (!todayData.length && uniqueDates.length > 0) {
    targetDate = uniqueDates[0].date;
    const day = targetDate.getUTCDate().toString().padStart(2, '0');
    const month = targetDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const year = targetDate.getUTCFullYear();
    targetDateStr = `${day} ${month} ${year}`;
    
    console.log(`📅 No today's data, using latest available: ${targetDateStr}`);
    
    todayData = data.filter(row => {
      const rowDateStr = String(row['Tanggal'] || '').trim();
      if (!rowDateStr) return false;
      
      const rowDate = parseTanggalString(rowDateStr);
      if (!rowDate) return false;
      
      return rowDate.getTime() === targetDate.getTime();
    });
  }

  console.log(`📊 Filtered ${todayData.length} records for ${targetDateStr} out of ${data.length} total`);

  if (!todayData.length) {
    return `📂 Tidak ada data transaksi yang tersedia.`;
  }

  // Find row with Total value (akumulatif dan otomatis update)
  // ✅ Ambil saldo akhir dari LAST row (baris terakhir hari ini)
  let finalSaldo = 0;
  
  // Get the LAST row (baris terakhir untuk dapatkan total saldo akhir)
  const lastRow = todayData[todayData.length - 1];
  
  // Ambil dari kolom 'Total' di baris terakhir
  if (lastRow && lastRow['Total']) {
    const totalValue = String(lastRow['Total'] || '').trim();
    if (totalValue && totalValue !== '' && totalValue !== '0') {
      finalSaldo = parseInt(totalValue.replace(/[^\d-]/g, '')) || 0;
      console.log(`✅ Found saldo from LAST row column "Total": ${finalSaldo}`);
    }
  }
  
  // Debug: log semua kolom dari last row
  console.log(`🔍 Last row data:`, {
    tanggal: lastRow['Tanggal'],
    nominal: lastRow['Nominal'],
    total: lastRow['Total'],
    merchant: lastRow['Merchant']
  });
  console.log(`💰 Final Saldo (from last row):`, finalSaldo);
  
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
  
  // Build compact summary for mobile
  let message = '';
  message += '💰 *KANTONG SAKU*\n';
  message += `📅 ${todayData[0]['Tanggal']}\n\n`;
  
  message += `📤 Pengeluaran: Rp${dailyExpense.toLocaleString('id-ID')}\n`;
  message += `📊 Batas: Rp${TOLERANCE_LIMIT.toLocaleString('id-ID')}\n`;
  
  if (isWarning) {
    message += `🔴 *WARNING* +Rp${exceeding.toLocaleString('id-ID')}\n`;
  } else {
    const remaining = TOLERANCE_LIMIT - dailyExpense;
    message += `🟢 *AMAN* sisa Rp${remaining.toLocaleString('id-ID')}\n`;
  }
  
  message += `\n💰 Saldo: Rp${finalSaldo.toLocaleString('id-ID')}`;


  return message;
}

// ✅ NEW: Get KantongSaku data (auth sudah di-check di index.js)
async function getKantongSakuData(userId) {
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



function detectSheetName(message, replyContext = '') {
    const fullText = (message + ' ' + replyContext).toLowerCase();
    
    for (const [pattern, sheetName] of Object.entries(SHEET_NAME_MAP)) {
        if (fullText.includes(pattern)) {
            console.log(`🎯 EXACT SHEET: "${pattern}" → "${sheetName}"`);
            return sheetName;
        }
    }
    
    // Fallback untuk yang tidak di-map (unlikely)
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
  getKantongSakuData,     // ✅ NEW - Get KantongSaku data
  formatKantongSakuForWA, // ✅ NEW - Format untuk WhatsApp
  detectSheetName,
  shouldUseTools
};