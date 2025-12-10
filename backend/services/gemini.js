const axios = require('axios');

// 1. Read API Key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY is missing in .env file");
}

// 2. USE THE STABLE MODEL (gemini-1.5-flash)
// This model has a high free tier and will not give yo
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${'AIzaSyBT0qPGNsC_BlDSEWFeuLsVLwpbOT1fIgc'}`;

const SUPPORTED_ADVANCED_FUNCTIONS = ['sqrt', 'log', 'sin', 'cos', 'exp', 'tan', 'abs', 'inv'];

const consultGemini = async (inputCols, outputCol, currentFuncs, bestResult) => {
    const prompt = `
    Context: Input Columns: [${inputCols}], Output Column: '${outputCol}'.
    Current Operators: [${currentFuncs}]. 
    Best Formula So Far: "${bestResult ? bestResult.infix : 'None'}" (Accuracy: ${bestResult ? bestResult.accuracy : 0}).
    
    The current operators are insufficient (Accuracy < 99%).
    Task: Suggest ONE SINGLE new function from [${SUPPORTED_ADVANCED_FUNCTIONS}] that is likely missing.
    Constraint: Return JSON: { "functions": ["one_function_name"] }
    `;

    try {
        const response = await axios.post(GEMINI_API_URL, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });

        // Parse Response
        let rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawText);
        
        return parsed.functions?.[0] || null;

    } catch (error) {
        // Detailed Error Logging
        if (error.response) {
            console.error("❌ Gemini API Error:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("❌ Gemini Network Error:", error.message);
        }
        return null;
    }
};

module.exports = { consultGemini };