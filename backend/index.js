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
  console.error("❌ FATAL ERROR: Missing environment variables.");
  process.exit(1);
}

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
const SR_SERVICE_URL = 'http://localhost:5001/fit';

// --- 3. Mongoose Models --- //
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }
}, { timestamps: true });

const AnalysisResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  outputColumn: { type: String, required: true },
  formulaString: { type: String, required: true },
  accuracyScore: { type: Number, required: true }
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', UserSchema);
const AnalysisResult = mongoose.model('AnalysisResult', AnalysisResultSchema);

// --- 4. Middleware --- //
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '50mb' }));

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ detail: "Auth failed." });
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.userId, email: payload.email };
    next();
  } catch (error) { res.status(401).json({ detail: "Invalid token." }); }
};

// --- 5. Helpers --- //

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

// Helper to pause execution (Sleep)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const validateConstants = (formula) => {
    const piCount = (formula.match(/pi/gi) || []).length;
    const eCount = (formula.match(/\be\b/g) || []).length; 

    if (piCount > 3) return { valid: false, reason: "Too many 'pi' constants (>3)" };
    if (eCount > 2) return { valid: false, reason: "Too many 'e' constants (>2)" };
    return { valid: true };
};

// --- NEW HELPER: Maps X0, X1 to real column names ---
// --- HELPER: Maps X0, X1 to names provided by Python ---
function mapVariablesToNames(formula, featureNames) {
    if (!formula || !featureNames) return formula;
    let newFormula = formula;
    
    // Sort descending by index to avoid partial replacements
    featureNames.forEach((name, index) => {
        // We create a temporary map because we are replacing X0, X1...
        // But we need to be careful. The loop must go backwards or be specific.
    });

    // Create a map of index -> name
    const map = featureNames.map((name, index) => ({ index, name })).sort((a, b) => b.index - a.index);

    map.forEach(({ index, name }) => {
        const regex = new RegExp(`\\bX${index}\\b`, 'g');
        newFormula = newFormula.replace(regex, name);
    });
    return newFormula;
}

const SUPPORTED_BASIC_FUNCTIONS = ['add', 'sub', 'mul', 'div'];
const SUPPORTED_ADVANCED_FUNCTIONS = ['sqrt', 'log', 'sin', 'cos', 'exp', 'tan', 'abs', 'inv'];

// --- 6. Main Route --- //
// --- HELPER: Sleep function to avoid Rate Limiting ---

// --- 6. Main Route --- //
app.post('/analyze', authenticateUser, upload.single('file'), async (req, res) => {
  console.log("\n");
  console.log("═══════════════════════════════════════════════════════");
  console.log("          🚀 ANALYSIS WORKFLOW STARTED");
  console.log("═══════════════════════════════════════════════════════");
  
  try {
    const { output_column } = req.body;
    console.log(`\n📁 File: ${req.file?.originalname}`);
    console.log(`🎯 Output Column: ${output_column}`);
    console.log(`👤 User: ${req.user.email}`);
    
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
    
    // Explicitly filter out the output column from inputs
    const inputCols = headers.filter(h => h.trim() !== output_column.trim());
    
    console.log(`📋 Inputs: [${inputCols.join(', ')}]`);
    console.log(`📋 Target: ${output_column}`);
    
    if (inputCols.length === headers.length) {
        return res.status(400).json({ detail: "Output column not found." });
    }

    const dataSample = [headers.join(','), ...data.slice(0, 10).map(row => headers.map(h => row[h]).join(','))].join('\n');

    // --- STEP 1: TREND ANALYSIS (Gemini) ---
    console.log("\n🔍 === STEP 1: TREND ANALYSIS & STRATEGY ===");
    console.log("⏳ Asking Gemini for initial strategy...");
    
    const trendPrompt = `
    Analyze relationship between Inputs (${inputCols}) and Target (${output_column}).
    Sample: ${dataSample}
    - Exponential growth? -> 'exp'
    - Periodic? -> 'sin', 'cos'
    - Decay? -> 'log', 'inv'
    Return JSON: { "functions": ["func1", "func2"] } from allowed: [${SUPPORTED_ADVANCED_FUNCTIONS}]
    `;

    let trendFunctions = [];
    try {
        const result = await axios.post(GEMINI_API_URL, {
            contents: [{ parts: [{ text: trendPrompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const rawText = result.data.candidates[0].content.parts[0].text;
        const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        trendFunctions = JSON.parse(cleanText).functions || [];
        console.log(`✅ Strategy Suggestion: [${trendFunctions.join(', ')}]`);
    } catch(e) { console.log("⚠️ Trend check failed, using defaults."); }

    // Initial Function Set
    let functionSet = [...new Set([...SUPPORTED_BASIC_FUNCTIONS, ...trendFunctions])];

    // --- STEP 2: PYTHON ENGINE LOOP (Target: 99%) ---
    console.log("\n🧮 === STEP 2: PYTHON ENGINE LOOP (Target: 99%) ===");
    
    let bestResult = null;
    let attempts = 0;
    const MAX_RETRIES = 6; // Safety brake
    let currentAccuracy = 0;

    const runPython = async (funcs) => {
        try {
            console.log(`🔬 Spawning Python with: [${funcs.join(', ')}]`);
            const resp = await axios.post(SR_SERVICE_URL, { 
                data, 
                output_column, 
                function_set: funcs 
            }, { timeout: 120000 }); // 2 min timeout for Python
            return resp.data;
        } catch (e) { 
            console.error(`❌ Python Error: ${e.message}`);
            return { error: true, details: e.message }; 
        }
    };

    // The Refinement Loop
    while (currentAccuracy < 0.99 && attempts <= MAX_RETRIES) {
        attempts++;
        console.log(`\n🔄 Attempt ${attempts} / ${MAX_RETRIES + 1} ...`);

        let result = await runPython(functionSet);
        
        if (result.formula) {
            // 1. Convert Prefix to Infix
            let infix = convertPrefixToInfix(result.formula);
            
            // 2. Map Variables (UPDATED LOGIC)
            if (result.feature_names) {
                infix = mapVariablesToNames(infix, result.feature_names);
            } else {
                infix = mapVariablesToNames(infix, inputCols);
            }

            // 3. Validate Constants
            const validCheck = validateConstants(infix);

            if (!validCheck.valid) {
                console.log(`⚠️ Formula Rejected: ${validCheck.reason}`);
                result.accuracy = 0; // Penalize rejected formulas
                result.rejected = true;
                result.reason = validCheck.reason;
            } else {
                console.log(`✅ Valid Infix: ${infix}`);
                console.log(`📊 Accuracy: ${(result.accuracy * 100).toFixed(2)}%`);
                result.infix = infix;
                result.rejected = false;

                // --- CRITICAL FIX: UPDATE BEST RESULT ---
                if (!bestResult || result.accuracy > bestResult.accuracy) {
                    bestResult = result;
                    currentAccuracy = result.accuracy;
                }
            }
        }

        // Check Exit Condition
        if (currentAccuracy >= 0.99) {
            console.log("✨ Target Accuracy Reached!");
            break;
        }

        // If not good enough, ask Gemini what to ADD
        if (attempts <= MAX_RETRIES) {
            console.log("🤔 Accuracy < 99%. Asking Gemini for new operators...");
            
            // Wait 4 seconds to avoid Rate Limit
            console.log("⏳ Waiting 4s to avoid Rate Limit (429)...");
            await delay(4000); 

           const refinePrompt = `
        Context: Input ${inputCols}, Output ${output_column}.
        Current Funcs: [${functionSet}]. 
        Best Result So Far: "${bestResult ? bestResult.infix : 'None'}" (Acc: ${bestResult ? bestResult.accuracy : 0}).
        Goal: Reach > 99% accuracy.
        Task: Analyze the error and select the SINGLE BEST function from [${SUPPORTED_ADVANCED_FUNCTIONS}] that is missing.
        Constraint: Return EXACTLY ONE function name. Do not suggest multiple.
        Return JSON: { "functions": ["one_function_only"] }
        `;

        try {
            const refineResp = await axios.post(GEMINI_API_URL, {
                contents: [{ parts: [{ text: refinePrompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            });

            let rawText = refineResp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            console.log("🤖 Gemini Raw Response:", rawText); 

            const parsed = JSON.parse(rawText);
            
            // --- CHANGE: FORCE SINGLE SELECTION ---
            let newFuncs = parsed.functions || [];
            if (newFuncs.length > 1) {
                console.log(`⚠️ Gemini suggested ${newFuncs.length} funcs. Taking only the first one.`);
                newFuncs = [newFuncs[0]]; // Slice the array to keep only index 0
            }
            // --------------------------------------

            if (newFuncs.length > 0) {
                console.log(`💡 Adding Operator: [${newFuncs[0]}]`);
                functionSet = [...new Set([...functionSet, ...newFuncs])];
            } else {
                console.log("⚠️ Gemini had no new suggestions.");
                break; 
            }
        } catch(e) { 
            if (e.response && e.response.status === 429) {
                console.warn("⚠️ Rate Limit (429) Hit! Saving best result found so far.");
                break; 
            } else {
                console.error("❌ Refinement Error Details:", e.message);
                break; 
            }
        }
        }
    }

    if (!bestResult || !bestResult.infix) {
        return res.status(500).json({ detail: "Analysis failed to produce a valid formula." });
    }

    // --- STEP 3: SAVE ---
    console.log("\n💾 === STEP 3: SAVING ===");
    const finalSaved = await AnalysisResult.create({
        userId: req.user.id, filename: req.file.originalname, outputColumn: output_column,
        formulaString: bestResult.infix, accuracyScore: bestResult.accuracy
    });

    console.log(`✅ Saved ID: ${finalSaved._id}`);
    console.log(`📐 Final Formula: ${finalSaved.formulaString}`);
    console.log("═══════════════════════════════════════════════════════\n");

    res.status(201).json({
        id: finalSaved._id, formula: finalSaved.formulaString, accuracy_score: finalSaved.accuracyScore
    });

  } catch(error) {
    console.error("❌ ERROR:", error.message);
    res.status(500).json({ detail: error.message });
  }
});
// Auth & History Routes
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

app.get('/me', authenticateUser, async (req, res) => { res.json(req.user); });

app.get('/history', authenticateUser, async (req, res) => {
    const r = await AnalysisResult.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(r.map(x => ({ id: x._id, filename: x.filename, output_column: x.outputColumn, formula: x.formulaString, accuracy: x.accuracyScore, created_at: x.createdAt })));
});

const startServer = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected");
    app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
  } catch (error) { console.error("❌ Startup Failed:", error); }
};

startServer();