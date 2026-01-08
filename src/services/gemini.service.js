const { GoogleGenAI } = require('@google/genai');
const config = require('../config/config');
const { CHAT_MODELS, SUMMARY_MODELS } = require('../config/constants');

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
const modelStats = new Map();

function initModelStats() {
    [...CHAT_MODELS, ...SUMMARY_MODELS].forEach(model => {
        if (!modelStats.has(model.name)) {
            modelStats.set(model.name, {
                successCount: 0,
                failureCount: 0,
                lastUsed: null,
                lastError: null
            });
        }
    });
}

async function generateWithFallback(options, purpose = 'chat') {
    // Untuk intent detection, gunakan model tercepat
    const modelList = purpose === 'intent' ? [CHAT_MODELS[0], CHAT_MODELS[1]] : 
                      purpose === 'summary' ? SUMMARY_MODELS : 
                      CHAT_MODELS;
    
    // VALIDASI: Pastikan contents tidak kosong
    if (!options.contents || options.contents.trim() === '') {
        throw new Error('Contents cannot be empty');
    }
    
    for (let i = 0; i < modelList.length; i++) {
        const model = modelList[i];
        const stats = modelStats.get(model.name);

        try {
            console.log(`🤖 Trying ${model.name} (purpose: ${purpose})...`);
            const startTime = Date.now();
            
            let responseText;
            
            // PERBAIKAN: Gabungkan history + current message ke dalam contents
            let contents;
            
            if (options.history && options.history.length > 0 && purpose !== 'intent') {
                // Gabungkan history + current message (skip untuk intent detection)
                contents = [
                    ...options.history,
                    { role: 'user', parts: [{ text: options.contents }] }
                ];
            } else {
                // Tanpa history, kirim current message saja
                contents = options.contents;
            }
            
            console.log('🔍 Contents structure:', {
                isArray: Array.isArray(contents),
                length: Array.isArray(contents) ? contents.length : 'N/A',
                type: typeof contents
            });
            
            const response = await ai.models.generateContent({
                model: model.name,
                contents: contents,
                config: {
                    systemInstruction: options.systemInstruction,
                    ...options.config
                }
            });
            
            // ✅ PERBAIKAN: Extract text dari response yang benar
            // Google Gemini API response structure:
            // response.candidates[0].content.parts[0].text
            responseText = response?.candidates?.[0]?.content?.parts?.[0]?.text || 
                          response?.text || 
                          'Maaf, saya tidak dapat memberikan respons yang tepat.';
            
            const duration = Date.now() - startTime;

            if (stats) {
                stats.successCount++;
                stats.lastUsed = Date.now();
            }
            
            // ✅ DEBUG: Log response structure untuk troubleshooting
            console.log('✅ Response structure:', {
                hasCandidates: !!response?.candidates,
                candidatesLength: response?.candidates?.length || 0,
                textLength: responseText?.length || 0,
                textPreview: responseText?.substring(0, 60) || 'N/A'
            });
            
            console.log(`✅ ${model.name} OK (${duration}ms)`);
            
            return {
                text: responseText,
                modelUsed: model.name,
                modelCost: model.cost
            };
        } catch (error) {
            if (stats) {
                stats.failureCount++;
                stats.lastError = error.message;
            }
            console.error(`❌ ${model.name}: ${error.message}`);
            
            // Debug: Log options untuk troubleshooting
            if (error.message.includes('ContentUnion') || error.message.includes('required')) {
                console.error('🔍 DEBUG - options:', JSON.stringify({
                    hasHistory: !!options.history,
                    historyLength: options.history?.length || 0,
                    contentsType: typeof options.contents,
                    contentsLength: options.contents?.length || 0,
                    contentsSample: options.contents?.substring(0, 100)
                }));
            }
            
            if (i < modelList.length - 1) continue;
            throw error;
        }
    }
    throw new Error('All models failed');
}

function getModelStats() {
    return Array.from(modelStats.entries()).map(([name, s]) => 
        `${name}: ${s.successCount}/${s.failureCount} (${s.lastUsed ? 'recent' : 'idle'})`
    ).join('\n');
}

module.exports = {
    initModelStats,
    generateWithFallback,
    getModelStats
};
