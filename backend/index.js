// --- 1. Imports & Setup --- //
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const axios = require('axios');
const { Readable } = require('stream');

// --- 2. Configuration & Secrets --- //
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 8000;

if (!GEMINI_API_KEY || !MONGO_URI || !JWT_SECRET) {
  console.error("❌ FATAL ERROR: Missing environment variables (GEMINI_API_KEY, MONGO_URI, JWT_SECRET).");
  console.error("Please create a .env file with these values.");
  process.exit(1);
}

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
const SR_SERVICE_URL = 'http://localhost:5001/fit';

console.log("✅ Environment variables loaded successfully");
console.log(`📡 Gemini API configured`);
console.log(`🔬 SR Service URL: ${SR_SERVICE_URL}`);

// --- 3. Mongoose (MongoDB) Database Setup --- //
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }
}, { timestamps: true });

const AnalysisResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  outputColumn: { type: String, required: true },
  formulaString: { type: String, required: true }, // Stored as Infix
  accuracyScore: { type: Number, required: true }
}, { timestamps: true });

// Password Hashing Pre-Save Hook
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', UserSchema);
const AnalysisResult = mongoose.model('AnalysisResult', AnalysisResultSchema);

// --- 4. Express App & Middleware --- //
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '50mb' })); // Increased limit for larger CSVs

// --- 5. Authentication Middleware --- //
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: "Authentication failed: No token provided." });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.userId, email: payload.email };
    next();
  } catch (error) {
    res.status(401).json({ detail: "Authentication failed: Invalid token." });
  }
};

// --- 6. Helper Functions --- //

/**
 * Splits arguments for prefix parser
 */
const splitArgsForParser = (argsString) => {
  const args = [];
  let balance = 0;
  let start = 0;
  
  for (let i = 0; i < argsString.length; i++) {
    if (argsString[i] === '(') balance++;
    else if (argsString[i] === ')') balance--;
    else if (argsString[i] === ',' && balance === 0) {
      args.push(argsString.substring(start, i).trim());
      start = i + 1;
    }
  }
  args.push(argsString.substring(start).trim());
  return args;
};

/**
 * CHANGE 4: Converts prefix notation to infix
 */
const convertPrefixToInfix = (s) => {
  if (!s) return "";
  try {
    const s_clean = s.trim();
    const firstParen = s_clean.indexOf('(');
    
    if (firstParen === -1) return s_clean;
    
    const op = s_clean.substring(0, firstParen);
    const argsString = s_clean.substring(firstParen + 1, s_clean.length - 1);
    const args = splitArgsForParser(argsString).map(convertPrefixToInfix);
    
    let result;
    switch (op) {
      case 'add': result = `(${args[0]} + ${args[1]})`; break;
      case 'sub': result = `(${args[0]} - ${args[1]})`; break;
      case 'mul': result = `(${args[0]} * ${args[1]})`; break;
      case 'div': result = `(${args[0]} / ${args[1]})`; break;
      case 'sqrt': result = `sqrt(${args[0]})`; break;
      case 'log': result = `log(${args[0]})`; break;
      case 'sin': result = `sin(${args[0]})`; break;
      case 'cos': result = `cos(${args[0]})`; break;
      case 'exp': result = `exp(${args[0]})`; break;
      case 'tan': result = `tan(${args[0]})`; break;
      case 'abs': result = `abs(${args[0]})`; break;
      default: result = `${op}(${args.join(', ')})`;
    }
    return result;
  } catch (error) {
    console.error(`❌ Formula conversion failed: ${error.message}`);
    return s;
  }
};

/**
 * CHANGE 3: Validates Constant Usage
 * Limits 'pi' to 3 and 'e' to 2 occurrences.
 */
const validateConstants = (formula) => {
    const piCount = (formula.match(/pi/gi) || []).length;
    // Match 'e' only as a whole word, so we don't count 'exp' or 'height'
    const eCount = (formula.match(/\be\b/g) || []).length; 

    if (piCount > 3) return { valid: false, reason: "Too many 'pi' constants (max 3)" };
    if (eCount > 2) return { valid: false, reason: "Too many 'e' constants (max 2)" };
    return { valid: true };
};

/**
 * Calls the Python Symbolic Regression microservice
 */
const callSRService = async (data, outputColumn, functionSet) => {
  console.log(`\n🔬 Calling SR Service with functions: [${functionSet.join(', ')}]`);
  
  try {
    const payload = { data, output_column: outputColumn, function_set: functionSet };
    const response = await axios.post(SR_SERVICE_URL, payload, { timeout: 60000 });
    
    if (response.data && response.data.formula) {
        // CHANGE 4: Convert to Infix IMMEDIATELY upon receipt
        const rawFormula = response.data.formula;
        const infixFormula = convertPrefixToInfix(rawFormula);
        
        // CHANGE 3: Validate Constants
        const validation = validateConstants(infixFormula);
        
        if (!validation.valid) {
            console.log(`⚠️ Formula Rejected: ${validation.reason}`);
            // We return a "rejected" flag so the caller knows to retry or fail gracefully
            return { 
                formula: infixFormula, 
                raw_formula: rawFormula,
                accuracy: response.data.accuracy, 
                rejected: true, 
                reason: validation.reason 
            };
        }

        return { 
            formula: infixFormula, // Human readable
            raw_formula: rawFormula, // Machine readable (prefix)
            accuracy: response.data.accuracy,
            rejected: false
        };
    } else {
      throw new Error("Invalid response from SR service.");
    }
  } catch (error) {
    console.error(`❌ SR Service error: ${error.message}`);
    throw new Error(`Analysis Engine Failed: ${error.message}`);
  }
};

// Supported Functions Constants
const SUPPORTED_BASIC_FUNCTIONS = ['add', 'sub', 'mul', 'div'];
const SUPPORTED_ADVANCED_FUNCTIONS = ['sqrt', 'log', 'sin', 'cos', 'exp', 'tan', 'abs', 'inv'];
const ALL_SUPPORTED_FUNCTIONS = [...SUPPORTED_BASIC_FUNCTIONS, ...SUPPORTED_ADVANCED_FUNCTIONS];

/**
 * CHANGE 5: Context-Aware Refinement (Phase 4)
 * Uses history of failed functions/bloat to suggest better ones.
 */
const callGeminiForSuggestions = async (dataSample, inputCols, outputCol, simpleResult, previouslyUsedFuncs) => {
  console.log("\n🤖 === CALLING GEMINI FOR REFINEMENT (CHANGE 5) ===");
  
  const json_schema = {
    type: "OBJECT",
    properties: {
      "suggested_functions": {
        "type": "ARRAY",
        "items": { "type": "STRING" },
        "description": "An array of 2-3 function names to ADD or REPLACE"
      }
    }
  };
  
  const prompt = `
    I am running symbolic regression on this data.
    
    Context:
    1. Input Columns: ${inputCols.join(', ')}
    2. Output Column: ${outputCol}
    3. Previous attempt used: [${previouslyUsedFuncs.join(', ')}]
    4. Resulting Formula: "${simpleResult.formula}"
    5. Resulting Accuracy: ${simpleResult.accuracy.toFixed(4)}
    6. Data Sample: 
    ${dataSample}

    Problem: The formula is either too bloated or not accurate enough.
    
    Task:
    Analyze the data trends vs the failed formula. Which specific functions (from [${SUPPORTED_ADVANCED_FUNCTIONS.join(', ')}]) should I add to parse this data better?
    Return a JSON array of function names.
  `;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: json_schema }
  };
  
  try {
    const response = await axios.post(GEMINI_API_URL, payload, { headers: { 'Content-Type': 'application/json' } });
    const result = JSON.parse(response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    return result.suggested_functions || [];
  } catch (error) {
    console.error(`❌ Gemini Suggestion Error: ${error.message}`);
    return [];
  }
};

/**
 * CHANGE 2: Smart Function Suggestions based on Trends (Phase 2 Part 4)
 */
const callGeminiForTrendAnalysis = async (dataSample, inputCols, outputCol) => {
    console.log("\n🔍 === GEMINI TREND ANALYSIS (CHANGE 2) ===");
    
    const json_schema = {
      type: "OBJECT",
      properties: {
        "suggested_functions": { "type": "ARRAY", "items": { "type": "STRING" } }
      }
    };

    const prompt = `
        Analyze the numerical relationship between Inputs (${inputCols}) and Target (${outputCol}) in this sample:
        ${dataSample}
        
        Look at the CHANGES occurring towards the output column:
        - Does target grow exponentially? (Suggest 'exp')
        - Is it periodic/wavy? (Suggest 'sin', 'cos')
        - Does it decay or flatten? (Suggest 'log', 'sqrt', 'inv')
        
        Based on these trends, which functions from [${SUPPORTED_ADVANCED_FUNCTIONS.join(',')}] must be used?
        Return JSON array.
    `;

    try {
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: json_schema }
        };
        const response = await axios.post(GEMINI_API_URL, payload, { headers: { 'Content-Type': 'application/json' } });
        const result = JSON.parse(response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
        const suggestions = result.suggested_functions || [];
        console.log(`✅ Trend Analysis Suggestions: ${suggestions}`);
        return suggestions;
    } catch (e) {
        console.error("Gemini Trend Analysis Failed", e.message);
        return [];
    }
};

/**
 * CHANGE 1: Fast Physics Check (Returns Infix)
 */
const callGeminiForKnownFormula = async (dataSample, inputCols, outputCol) => {
  console.log("\n🎓 === GEMINI PHYSICS/MATH CHECK (CHANGE 1) ===");
  
  const json_schema = {
    type: "OBJECT",
    properties: {
      "found_known_formula": { "type": "BOOLEAN" },
      "formula_infix": { "type": "STRING", "description": "The formula in human-readable INFIX notation (e.g. m * a)" },
      "accuracy_r_squared": { "type": "NUMBER" }
    }
  };
  
  const prompt = `
    You are a physicist. Analyze this data:
    Headers: ${inputCols}, Target: ${outputCol}
    Sample:
    ${dataSample}

    1. Does this data fit any known Physics or Math formulas (Newtonian, Thermodynamics, Geometry, etc)?
    2. If YES, return the formula in human-readable INFIX notation.
    3. Calculate estimated R^2 accuracy.
    
    Return JSON.
  `;
  
  try {
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: json_schema }
    };
    const response = await axios.post(GEMINI_API_URL, payload, { headers: { 'Content-Type': 'application/json' } });
    const result = JSON.parse(response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    
    if (result.found_known_formula) {
        console.log(`✅ Known Formula Found: ${result.formula_infix}`);
    }
    return result;
  } catch (error) {
    console.error(`❌ Physics Check Error: ${error.message}`);
    return { found_known_formula: false };
  }
};


// --- 7. API Endpoints --- //

app.get("/", (req, res) => res.send("Evosolve JS backend (Updated) is running!"));

// (Register and Login routes remain unchanged - abbreviated for brevity)
app.post('/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        if (await User.findOne({ email })) return res.status(400).json({ detail: "Email exists" });
        const user = new User({ email, password });
        await user.save();
        const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ access_token: token, token_type: "bearer" });
    } catch (e) { res.status(500).json({ detail: e.message }); }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) return res.status(401).json({ detail: "Invalid credentials" });
        const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.status(200).json({ access_token: token, token_type: "bearer" });
    } catch (e) { res.status(500).json({ detail: e.message }); }
});

app.get('/me', authenticateUser, async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
});


// --- MAIN ANALYSIS ROUTE ---
app.post('/analyze', authenticateUser, upload.single('file'), async (req, res) => {
  console.log("\n🚀 ANALYSIS WORKFLOW STARTED");
  
  try {
    const { output_column } = req.body;
    if (!req.file || !output_column) return res.status(400).json({ detail: "Missing file or output column." });
    
    // 1. CSV Parsing
    const data = [];
    const readable = new Readable();
    readable._read = () => {};
    readable.push(req.file.buffer);
    readable.push(null);
    
    await new Promise((resolve, reject) => {
      readable.pipe(csv()).on('data', (row) => data.push(row)).on('end', resolve).on('error', reject);
    });
    
    const headers = Object.keys(data[0]);
    if (!headers.includes(output_column)) return res.status(400).json({ detail: "Output column not found." });
    const inputCols = headers.filter(h => h !== output_column);
    
    // Prepare Data Sample (10 rows for better trend analysis)
    const dataSample = [
      headers.join(','),
      ...data.slice(0, 10).map(row => headers.map(h => row[h]).join(','))
    ].join('\n');

    // --- CHANGE 1: KNOWN FORMULA CHECK (Fast Path) ---
    const knownFormulaResult = await callGeminiForKnownFormula(dataSample, inputCols, output_column);
    
    if (knownFormulaResult.found_known_formula && knownFormulaResult.accuracy_r_squared > 0.99) {
       // Save Result (It is already Infix thanks to Change 1)
       const newResult = await AnalysisResult.create({
          userId: req.user.id,
          filename: req.file.originalname,
          outputColumn: output_column,
          formulaString: knownFormulaResult.formula_infix,
          accuracyScore: knownFormulaResult.accuracy_r_squared
       });
       return res.status(201).json({
         id: newResult._id,
         formula: newResult.formulaString,
         accuracy_score: newResult.accuracyScore,
         message: "Fast Match: Known Physics/Math Formula Found"
       });
    }

    // --- DISCOVERY WORKFLOW ---
    
    // --- CHANGE 2: TREND ANALYSIS ---
    // Instead of just checking column names, we check data trends
    const trendFunctions = await callGeminiForTrendAnalysis(dataSample, inputCols, output_column);
    
    // Merge basic + trend functions
    let currentFunctionSet = [...new Set([...SUPPORTED_BASIC_FUNCTIONS, ...trendFunctions])];
    
    // Run Regression 1
    let result = await callSRService(data, output_column, currentFunctionSet);
    
    // If rejected due to Constants (Change 3) or Low Accuracy, try Refinement (Change 5)
    if (result.rejected || result.accuracy < 0.95) {
        console.log("⚠️ First run suboptimal. Attempting refinement...");
        
        // --- CHANGE 5: REFINEMENT ---
        const newSuggestions = await callGeminiForSuggestions(
            dataSample, 
            inputCols, 
            output_column, 
            result, 
            currentFunctionSet
        );
        
        if (newSuggestions.length > 0) {
            // Update function set
            currentFunctionSet = [...new Set([...currentFunctionSet, ...newSuggestions])];
            console.log(`🔄 Retrying with enhanced set: ${currentFunctionSet}`);
            
            const refinedResult = await callSRService(data, output_column, currentFunctionSet);
            
            // If the new result is better or valid, use it
            if (!refinedResult.rejected && refinedResult.accuracy > result.accuracy) {
                result = refinedResult;
            }
        }
    }

    if (result.rejected) {
        return res.status(422).json({ 
            detail: `Formula generated but rejected: ${result.reason}. Try cleaning data or simplifying.` 
        });
    }

    // Save Final Result
    const newResult = await AnalysisResult.create({
      userId: req.user.id,
      filename: req.file.originalname,
      outputColumn: output_column,
      formulaString: result.formula, // Already Infix (Change 4)
      accuracyScore: result.accuracy
    });

    res.status(201).json({
      id: newResult._id,
      formula: newResult.formulaString,
      accuracy_score: newResult.accuracyScore,
      created_at: newResult.createdAt
    });

  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ detail: error.message });
  }
});

app.get('/history', authenticateUser, async (req, res) => {
    const results = await AnalysisResult.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(results.map(r => ({
        id: r._id,
        filename: r.filename,
        output_column: r.outputColumn,
        formula: r.formulaString,
        accuracy: r.accuracyScore,
        created_at: r.createdAt
    })));
});

// --- 8. Server Start --- //
const startServer = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected");
    app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
  } catch (error) {
    console.error("❌ Server Startup Failed:", error);
  }
};

startServer();