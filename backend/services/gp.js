const axios = require('axios');
const SR_SERVICE_URL = 'http://localhost:5001/fit';

const runGPEngine = async (cleanData, functionSet) => {
    try {
        console.log(`🔬 Spawning Python with: [${functionSet.join(', ')}]`);
        const response = await axios.post(SR_SERVICE_URL, { 
            data: cleanData, 
            output_column: 'y', // We send normalized column name 'y'
            function_set: functionSet 
        }, { timeout: 120000 }); // 2 min timeout

        return response.data;
    } catch (error) {
        // Return a safe error object instead of crashing
        let msg = "Unknown Python Error";
        if (error.response && error.response.data) {
            msg = JSON.stringify(error.response.data);
        } else {
            msg = error.message;
        }
        console.error(`❌ Python Error: ${msg}`);
        return { error: true, details: msg };
    }
};

module.exports = { runGPEngine };