require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

// --- Import Modules ---
// Make sure these files exist in your 'services' and 'utils' folders!
const { consultGemini } = require('./services/gemini');
const { runGPEngine } = require('./services/gp');
const { convertPrefixToInfix, mapVariables, validateConstants } = require('./utils/mathHelpers');

// --- Config ---
const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!process.env.GEMINI_API_KEY || !MONGO_URI || !JWT_SECRET) {
    console.error("❌ Missing .env variables");
    process.exit(1);
}

// --- Mongoose Schemas ---
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});
UserSchema.methods.comparePassword = async function(cand) {
    return await bcrypt.compare(cand, this.password);
};
const User = mongoose.model('User', UserSchema);

const AnalysisResult = mongoose.model('AnalysisResult', new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    filename: String,
    outputColumn: String,
    formulaString: String,
    accuracyScore: Number
}, { timestamps: true }));

// --- Middleware ---
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '50mb' }));

const authenticateUser = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ detail: "Auth failed." });
    try {
        const payload = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        req.user = { id: payload.userId, email: payload.email };
        next();
    } catch (e) { res.status(401).json({ detail: "Invalid token" }); }
};

// --- CORE ROUTE: ANALYZE ---
app.post('/analyze', authenticateUser, upload.single('file'), async (req, res) => {
    console.log("\n🚀 WORKFLOW STARTED");
    try {
        const { output_column } = req.body;
        if (!req.file || !output_column) return res.status(400).json({ detail: "Missing file/column" });

        // 1. Parse CSV
        const rawData = [];
        const stream = Readable.from(req.file.buffer);
        await new Promise((resolve, reject) => {
            stream.pipe(csv()).on('data', r => rawData.push(r)).on('end', resolve).on('error', reject);
        });

        // 2. Prepare Data (Clean Numbers)
        const headers = Object.keys(rawData[0]);
        const targetHeader = headers.find(h => h.trim() === output_column.trim());
        if (!targetHeader) return res.status(400).json({ detail: `Target '${output_column}' not found` });
        
        const inputCols = headers.filter(h => h !== targetHeader);
        const cleanData = rawData.map(row => {
            const newRow = { y: parseFloat(row[targetHeader]) || 0 };
            inputCols.forEach((col, i) => newRow[`X${i}`] = parseFloat(row[col]) || 0);
            return newRow;
        });

        // 3. The Loop
        let functionSet = ['add', 'sub', 'mul', 'div'];
        let bestResult = null;
        let attempts = 0;
        const MAX_RETRIES = 6;

        while (attempts <= MAX_RETRIES) {
            attempts++;
            console.log(`\n🔄 Attempt ${attempts}: Using [${functionSet.join(', ')}]`);

            // A. Run GP Engine
            let result = await runGPEngine(cleanData, functionSet);

            // B. Validate Result
            if (!result.error && result.formula) {
                let readableFormula = convertPrefixToInfix(result.formula);
                readableFormula = mapVariables(readableFormula, inputCols);
                const validCheck = validateConstants(readableFormula);

                if (!validCheck.valid) {
                    console.log(`⚠️ Rejected: ${validCheck.reason}`);
                } else {
                    console.log(`📊 Accuracy: ${(result.accuracy * 100).toFixed(2)}%`);
                    if (!bestResult || result.accuracy > bestResult.accuracy) {
                        bestResult = { ...result, infix: readableFormula };
                    }
                    if (result.accuracy >= 0.99) {
                        console.log("✨ Success!");
                        break;
                    }
                }
            }

            // C. Consult Gemini
            if (attempts <= MAX_RETRIES) {
                console.log("🤔 Accuracy low. Asking Gemini...");
                await new Promise(r => setTimeout(r, 10000)); // Rate limit buffer
                
                const newOp = await consultGemini(inputCols, output_column, functionSet, bestResult);
                
                if (newOp && !functionSet.includes(newOp)) {
                    console.log(`💡 Adding: [${newOp}]`);
                    functionSet.push(newOp);
                } else {
                    console.log("⚠️ No new suggestion. Stopping.");
                    break;
                }
            }
        }

        // 4. Save & Return
        if (bestResult) {
            const saved = await AnalysisResult.create({
                userId: req.user.id,
                filename: req.file.originalname,
                outputColumn: output_column,
                formulaString: bestResult.infix,
                accuracyScore: bestResult.accuracy
            });
            res.json({ id: saved._id, formula: saved.formulaString, accuracy: saved.accuracyScore });
        } else {
            res.status(500).json({ detail: "Failed to generate formula" });
        }

    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: e.message });
    }
});

// --- AUTH ROUTES (THESE WERE MISSING!) ---

app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (await User.findOne({ email })) return res.status(400).json({ detail: "Email exists" });
        const user = new User({ email, password });
        await user.save();
        const token = jwt.sign({ userId: user._id, email }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ access_token: token, token_type: "bearer" });
    } catch (e) { res.status(500).json({ detail: e.message }); }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) return res.status(401).json({ detail: "Invalid credentials" });
        const token = jwt.sign({ userId: user._id, email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ access_token: token, token_type: "bearer" });
    } catch (e) { res.status(500).json({ detail: e.message }); }
});

app.get('/history', authenticateUser, async (req, res) => {
    const r = await AnalysisResult.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(r.map(x => ({ 
        id: x._id, filename: x.filename, output_column: x.outputColumn, 
        formula: x.formulaString, accuracy: x.accuracyScore, created_at: x.createdAt 
    })));
});

app.get('/me', authenticateUser, (req, res) => res.json(req.user));

// --- Start Server ---
mongoose.connect(MONGO_URI).then(() => {
    console.log("✅ MongoDB Connected");
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}).catch(err => console.error("DB Error:", err));