// --- 1. Imports & Setup ---

// Load environment variables from .env file FIRST
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose'); // New: Mongoose for MongoDB
const bcrypt = require('bcryptjs'); // Using bcryptjs
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const axios = require('axios');
const { Readable } = require('stream');

// --- 2. Configuration & Secrets ---

// Load secrets from .env file
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 8000;

// Validate that all secrets are loaded
if (!GEMINI_API_KEY || !MONGO_URI || !JWT_SECRET) {
  console.error("FATAL ERROR: Missing environment variables (GEMINI_API_KEY, MONGO_URI, JWT_SECRET).");
  console.error("Please create a .env file with these values.");
  process.exit(1); // Exit the application if secrets are missing
}

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

// --- 3. Mongoose (MongoDB) Database Setup ---

// Define Mongoose Schemas (replaces Sequelize models)
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  }
}, { timestamps: true }); // Adds createdAt & updatedAt

const AnalysisResultSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Links to the User model
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  outputColumn: {
    type: String,
    required: true,
  },
  formulaString: {
    type: String,
    required: true,
  },
  accuracyScore: {
    type: Number,
    required: true,
  }
}, { timestamps: true });

// Create Models from Schemas
const User = mongoose.model('User', UserSchema);
const AnalysisResult = mongoose.model('AnalysisResult', AnalysisResultSchema);

// --- 4. Express App & Middleware ---

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json()); // for parsing application/json

// --- 5. Authentication Functions (Middleware & Helpers) ---

// Password Hashing (Mongoose-style, using bcryptjs)
// We'll add this as a "pre-save hook" to the UserSchema
// This automatically hashes the password *before* it's saved
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Password comparison helper
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// JWT Authentication Middleware
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: "Authentication failed: No token provided." });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Attach user's ID to the request object for protected routes
    req.user = { id: payload.userId, email: payload.email }; 
    next();
  } catch (error) {
    res.status(401).json({ detail: "Authentication failed: Invalid token." });
  }
};

// --- 6. Auth API Endpoints (Rewritten for Mongoose) ---

app.get("/", (req, res) => {
  res.send("Evosolve JS backend (MongoDB Version) is running!");
});

// POST /register
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ detail: "Please provide email and password." });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ detail: "Email already registered." });
    }
    
    // Create new user (password will be auto-hashed by the 'pre-save' hook)
    const user = new User({ email, password });
    await user.save();

    // Create token
    const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, {
      expiresIn: '24h',
    });

    res.status(201).json({ access_token: token, token_type: "bearer" });

  } catch (error) {
    res.status(500).json({ detail: `Registration failed: ${error.message}` });
  }
});

// POST /login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ detail: "Please provide email and password." });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ detail: "Invalid credentials." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ detail: "Invalid credentials." });
    }

    const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, {
      expiresIn: '24h',
    });

    res.status(200).json({ access_token: token, token_type: "bearer" });

  } catch (error) {
    res.status(500).json({ detail: `Login failed: ${error.message}` });
  }
});

// GET /me (Protected)
app.get('/me', authenticateUser, async (req, res) => {
  // We re-fetch the user from DB to ensure data is fresh
  // (req.user.id was attached by the middleware)
  try {
    const user = await User.findById(req.user.id).select('-password'); // -password excludes it
    if (!user) {
      return res.status(404).json({ detail: "User not found." });
    }
    res.status(200).json({
      id: user._id,
      email: user.email,
      createdAt: user.createdAt
    });
  } catch (error) {
    res.status(500).json({ detail: `Error fetching user: ${error.message}` });
  }
});

// --- 7. LLM Helper Function (Now uses the API Key) ---
// --- 7. Helper Functions ---

// NEW: URL for our Python microservice
const SR_SERVICE_URL = 'http://localhost:5001/fit';

/**
 * NEW: Calls the Python Symbolic Regression microservice.
 * @param {object[]} data - The full dataset as an array of objects.
 * @param {string} outputColumn - The target output column name.
 * @param {string[]} functionSet - The list of functions for Gplearn (e.g., ['add', 'mul'])
 * @returns {Promise<{formula: string, accuracy: number}>}
 */
const callSRService = async (data, outputColumn, functionSet) => {
  try {
    const payload = {
      data: data,
      output_column: outputColumn,
      function_set: functionSet
    };

    // Make the API call to the Python service
    // Set a long timeout, as Gplearn can take time
    const response = await axios.post(SR_SERVICE_URL, payload, {
      timeout: 60000 // 60 second timeout
    });
    
    if (response.data && response.data.formula) {
      return {
        formula: response.data.formula,
        accuracy: response.data.accuracy
      };
    } else {
      // Handle cases where the service returns a 200 but no formula
      throw new Error("Invalid or empty response from SR service.");
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error("FATAL: Cannot connect to Python SR service. Is it running on port 5001?");
      throw new Error("Analysis engine is offline. Please contact support.");
    }
    // Handle other errors (timeout, Python code error, etc.)
    console.error(`SR Service call failed: ${error.message}`);
    const errorDetail = error.response?.data?.error || error.message;
    throw new Error(`Analysis Engine Failed: ${errorDetail}`);
  }
};

/**
 * MODIFIED: Calls Gemini to get *suggestions* for advanced functions.
 * @param {string} dataSample - A CSV string sample of the data.
 * @param {string[]} inputCols - List of input column names.
 * @param {string} outputCol - The target output column name.
 * @param {object} simpleResult - The failed result from the simple run.
 * @returns {Promise<string[]>} A promise that resolves to an array of suggested function names, e.g., ['sqrt']
 */
const callGeminiForSuggestions = async (dataSample, inputCols, outputCol, simpleResult) => {
  // Define the JSON schema we want the LLM to return
  const json_schema = {
    type: "OBJECT",
    properties: {
      "suggested_functions": {
        "type": "ARRAY",
        "items": { "type": "STRING" },
        "description": "An array of 1 or 2 function names from the allowed list, e.g., ['sqrt'] or ['sin', 'cos']"
      }
    }
  };

  const advanced_function_list = "['sqrt', 'log', 'sin', 'cos', 'exp']";

  const prompt = `
    You are an expert data scientist collaborating on a symbolic regression problem.
    Your task is to *suggest* advanced functions to improve a failed model.

    Here is the problem:
    - Input columns: ${inputCols.join(', ')}
    - Output column: '${outputCol}'
    - Data Sample:
      ${dataSample}

    My first attempt used only basic functions (add, sub, mul, div) and it *failed*.
    - Failed Formula: '${simpleResult.formula}'
    - Failed Accuracy (R-squared): ${simpleResult.accuracy.toFixed(4)}

    This low accuracy implies a non-linear relationship.
    From the following list of advanced functions: ${advanced_function_list}
    Which 1 or 2 functions would you recommend I add to my analysis to find the true, simple, non-linear formula?

    Return *only* a JSON object matching the requested schema. If no functions seem appropriate, return an empty array.
    `;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: json_schema
    }
  };

  try {
    // Make the API call to Gemini
    const response = await axios.post(GEMINI_API_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000 // 30 second timeout
    });
    
    const result = response.data;
    const json_text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!json_text) {
      throw new Error("Invalid response structure from LLM.");
    }
    
    // Parse the JSON string from the LLM's text response
    const parsed_json = JSON.parse(json_text);
    
    // Return the array of suggestions
    return parsed_json.suggested_functions || [];

  } catch (error) {
    if (error.response) {
      console.error(`Gemini API call failed with status ${error.response.status}:`, error.response.data);
    } else {
      console.error(`Gemini API call failed: ${error.message}`);
    }
    // On failure, return an empty array so the workflow can continue
    return [];
  }
};


// --- 8. Core API Endpoints (Rewritten for Mongoose) ---

app.get('/api/functions', (req, res) => {
  res.status(200).json({
    basic: ['add', 'sub', 'mul', 'div'],
    advanced: ['sqrt', 'log', 'sin', 'cos', 'exp']
  });
});

// POST /analyze (Protected) - FINAL WORKFLOW
app.post('/analyze', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    const { output_column } = req.body;
    if (!req.file || !output_column) {
      return res.status(400).json({ detail: "File or output column missing." });
    }
    
    // --- 1. Parse CSV ---
    const data = [];
    const fileBuffer = req.file.buffer;
    const readable = new Readable();
    readable._read = () => {}; 
    readable.push(fileBuffer);
    readable.push(null);

    await new Promise((resolve, reject) => {
      readable.pipe(csv({
        mapValues: ({ header, index, value }) => {
          const num = Number(value);
          return isNaN(num) ? value : num;
        }
      }))
        .on('data', (row) => data.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    if (data.length === 0) {
      return res.status(400).json({ detail: "CSV file is empty or invalid." });
    }
    const headers = Object.keys(data[0]);
    if (!headers.includes(output_column)) {
      return res.status(400).json({ detail: `Output column '${output_column}' not found.` });
    }
    const inputCols = headers.filter(h => h !== output_column);
    if (inputCols.length === 0) {
      return res.status(400).json({ detail: "No input columns found (only output column)." });
    }

    // --- 2. NEW "KNOWN FORMULA" CHECK (YOUR STEP 2) ---
    console.log("--- Analysis Run 0.5: Checking for known formulas ---");
    const dataSample = [
      headers.join(','),
      ...data.slice(0, 50).map(row => headers.map(h => row[h]).join(','))
    ].join('\n');

    const knownFormulaResult = await callGeminiForKnownFormula(dataSample, inputCols, output_column);
    const KNOWN_FORMULA_THRESHOLD = 0.99; // 99% accuracy to be considered a match

    // --- 3. NEW CHECKPOINT ---
    if (knownFormulaResult.found_known_formula && knownFormulaResult.accuracy_r_squared > KNOWN_FORMULA_THRESHOLD) {
      
      // --- FAST PATH: KNOWN FORMULA FOUND ---
      console.log(`--- Found known formula: ${knownFormulaResult.formula} with accuracy ${knownFormulaResult.accuracy_r_squared} ---`);
      console.log("--- Skipping Gplearn, returning LLM-found formula. ---");

      // Save and return this LLM-generated formula
      const newResult = await AnalysisResult.create({
        userId: req.user.id,
        filename: req.file.originalname,
        outputColumn: output_column,
        formulaString: knownFormulaResult.formula, // The formula from the LLM
        accuracyScore: knownFormulaResult.accuracy_r_squared
      });
      
      return res.status(201).json({
        id: newResult._id,
        filename: newResult.filename,
        output_column: newResult.outputColumn,
        formula: newResult.formulaString,
        accuracy_score: newResult.accuracyScore,
        created_at: newResult.createdAt
      });

    } else {
      
      // --- SLOW PATH: NO KNOWN FORMULA. RUN GPLEARN WORKFLOW. ---
      console.log("--- No known formula found or accuracy was low. Proceeding to Gplearn discovery workflow. ---");
      
      // --- Stage 0: "Pre-Check" for Gplearn ---
      console.log("--- Analysis Run 0: Pre-Check for known functions ---");
      const preCheckFunctions = await callGeminiForPreCheck(inputCols, output_column);
      if (preCheckFunctions.length > 0) {
        console.log(`--- Pre-Check suggested: [${preCheckFunctions.join(', ')}] ---`);
      }

      // --- Stage 1: Simple Local Run (Your Step 3) ---
      console.log("--- Analysis Run 1: Simple Local Run ---");
      const simpleFunctions = ['add', 'sub', 'mul', 'div'];
      let simpleResult = await callSRService(data, output_column, simpleFunctions);
      
      let final_formula = simpleResult.formula;
      let final_accuracy = simpleResult.accuracy;

      // --- Stage 2 & 3: Metamorphic Checkpoint (Your Step 4) ---
      const ACCURACY_THRESHOLD = 0.99; 
      const COMPLEXITY_THRESHOLD = 8; // Max 100 chars

      const simpleInfixFormula = convertPrefixToInfix(final_formula);
      console.log(`--- Simple Run Check: Accuracy (${final_accuracy.toFixed(4)}) | Complexity (${simpleInfixFormula.length}) ---`);

      if (final_accuracy < ACCURACY_THRESHOLD || simpleInfixFormula.length > COMPLEXITY_THRESHOLD) {
        
        let logMessage = `--- Simple run failed (`;
        if (final_accuracy < ACCURACY_THRESHOLD) logMessage += `Accuracy: ${final_accuracy.toFixed(4)} < ${ACCURACY_THRESHOLD}`;
        if (simpleInfixFormula.length > COMPLEXITY_THRESHOLD) logMessage += ` | Bloated Formula: ${simpleInfixFormula.length} > ${COMPLEXITY_THRESHOLD} chars`;
        logMessage += `). Calling LLM for suggestions... ---`;
        console.log(logMessage);

        // --- LLM Suggestion Run (Your Step 5) ---
        const postFailureFunctions = await callGeminiForSuggestions(
          dataSample, 
          inputCols, 
          output_column, 
          simpleResult
        );

        const allSuggestedFunctions = [...new Set([...preCheckFunctions, ...postFailureFunctions])];
        
        if (allSuggestedFunctions.length > 0) {
          console.log(`--- LLM(s) suggested: [${allSuggestedFunctions.join(', ')}]. ---`);
          
          const advancedFunctions = [...new Set([...simpleFunctions, ...allSuggestedFunctions])];
          
          // --- Advanced Gplearn Run (Your Step 6) ---
          console.log("--- Analysis Run 2: Advanced Local Run ---");
          let advancedResult = await callSRService(data, output_column, advancedFunctions);

          // --- Stage 4: Final Selection ---
          if (advancedResult.accuracy > final_accuracy) {
            console.log(`--- Advanced run succeeded! New Accuracy: ${advancedResult.accuracy} ---`);
            final_formula = advancedResult.formula;
            final_accuracy = advancedResult.accuracy;
          } else {
            console.log("--- Advanced run did not improve accuracy. Keeping simple formula. ---");
          }
        } else {
           console.log("--- No advanced functions suggested. Keeping simple formula. ---");
        }
      } else {
        console.log(`--- Simple run sufficient (Accuracy: ${final_accuracy}) ---`);
      }

      if (!final_formula || final_accuracy === undefined) {
        return res.status(500).json({ detail: "Analysis failed to return a valid formula." });
      }

      // --- 5. Format the Gplearn Formula for Readability ---
      console.log(`--- Original Gplearn Formula: ${final_formula} ---`);
      const infixFormula = convertPrefixToInfix(final_formula);
      console.log(`--- Formatted Gplearn Formula: ${infixFormula} ---`);

      // --- 6. Save Gplearn Formula to Database ---
      const newResult = await AnalysisResult.create({
        userId: req.user.id,
        filename: req.file.originalname,
        outputColumn: output_column,
        formulaString: infixFormula, // <-- Save the formatted Gplearn formula
        accuracyScore: final_accuracy
      });

      // --- 7. Return the Gplearn result ---
      res.status(201).json({
        id: newResult._id,
        filename: newResult.filename,
        output_column: newResult.outputColumn,
        formula: newResult.formulaString, // <-- Send the formatted Gplearn formula
        accuracy_score: newResult.accuracyScore,
        created_at: newResult.createdAt
      });
    } // End of the new "else" block

  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ detail: `Analysis failed: ${error.message}` });
  }
});

// GET /history (Protected, Mongoose Version)
app.get('/history', authenticateUser, async (req, res) => {
  try {
    // Find all results for the logged-in user and sort by newest first
    const results = await AnalysisResult.find({ userId: req.user.id })
      .sort({ createdAt: -1 }); // Mongoose sort syntax
    
    // Format the results to match frontend expectations
    const formattedResults = results.map(item => ({
      id: item._id, // MongoDB uses _id
      filename: item.filename,
      output_column: item.outputColumn,
      formula_string: item.formulaString, // Match frontend expectation
      accuracy_score: item.accuracyScore, // Match frontend expectation
      created_at: item.createdAt
    }));

    res.status(200).json(formattedResults);
  } catch (error) {
    res.status(500).json({ detail: `Failed to fetch history: ${error.message}` });
  }
});
/**
 * NEW: Calls Gemini to pre-check column names for a known formula.
 * @param {string[]} inputCols - List of input column names.
 * @param {string} outputCol - The target output column name.
 * @returns {Promise<string[]>} A promise that resolves to an array of suggested function names, e.g., ['sqrt']
 */
const callGeminiForPreCheck = async (inputCols, outputCol) => {
  const json_schema = {
    type: "OBJECT",
    properties: {
      "suggested_functions": {
        "type": "ARRAY",
        "items": { "type": "STRING" },
        "description": "An array of 1 or 2 function names from the allowed list, e.g., ['sqrt'] or ['sin', 'cos']"
      }
    }
  };
  const advanced_function_list = "['sqrt', 'log', 'sin', 'cos', 'exp']";

  const prompt = `
    You are a scientist. Look *only* at the column names of a dataset.
    - Input(s): ${inputCols.join(', ')}
    - Output: ${outputCol}

    Does this combination suggest a famous, pre-existing formula from physics, math, or engineering?
    (e.g., "Length (L)" and "Period (T)" suggests the pendulum formula).

    If YES, which functions from this list ${advanced_function_list} are needed for that formula?
    If NO, or if the names are generic (like 'x', 'y'), just return an empty array.

    Return *only* a JSON object matching the requested schema.
    `;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: json_schema
    }
  };

  try {
    const response = await axios.post(GEMINI_API_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000
    });
    const result = response.data;
    const json_text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!json_text) return []; // Return empty on failure
    const parsed_json = JSON.parse(json_text);
    return parsed_json.suggested_functions || [];
  } catch (error) {
    console.error(`Gemini Pre-Check failed: ${error.message}`);
    return []; // Always return an empty array on error to avoid breaking the flow
  }
};


/**
 * NEW HELPER: Splits arguments for the prefix parser, respecting nested parentheses.
 * @param {string} argsString - The raw argument string, e.g., "div(x, y), mul(a, b)"
 * @returns {string[]} An array of arguments, e.g., ["div(x, y)", "mul(a, b)"]
 */
const splitArgsForParser = (argsString) => {
  const args = [];
  let balance = 0;
  let start = 0;
  for (let i = 0; i < argsString.length; i++) {
    if (argsString[i] === '(') {
      balance++;
    } else if (argsString[i] === ')') {
      balance--;
    } else if (argsString[i] === ',' && balance === 0) {
      // Found a top-level comma, split here
      args.push(argsString.substring(start, i).trim());
      start = i + 1;
    }
  }
  // Add the last argument
  args.push(argsString.substring(start).trim());
  return args;
};

/**
 * NEW: Converts Gplearn's prefix notation to standard infix notation.
 * @param {string} s - The prefix formula string, e.g., "add(mul(x, 2), 5)"
 * @returns {string} The infix formula string, e.g., "((x * 2) + 5)"
 */
const convertPrefixToInfix = (s) => {
  try {
    const s_clean = s.trim();
    
    // Base case: If it's a number or a variable (no parentheses), return it.
    const firstParen = s_clean.indexOf('(');
    if (firstParen === -1) {
      return s_clean;
    }

    // Recursive case: It's a function
    const op = s_clean.substring(0, firstParen);
    const argsString = s_clean.substring(firstParen + 1, s_clean.length - 1);
    
    // Recursively parse the arguments
    const args = splitArgsForParser(argsString).map(convertPrefixToInfix);

    // Format based on the operation
    switch (op) {
      // Binary operators
      case 'add':
        return `(${args[0]} + ${args[1]})`;
      case 'sub':
        return `(${args[0]} - ${args[1]})`;
      case 'mul':
        return `(${args[0]} * ${args[1]})`;
      case 'div':
        return `(${args[0]} / ${args[1]})`;
      
      // Unary operators (1 argument)
      case 'sqrt':
        return `sqrt(${args[0]})`;
      case 'log':
        return `log(${args[0]})`;
      case 'sin':
        return `sin(${args[0]})`;
      case 'cos':
        return `cos(${args[0]})`;
      case 'exp':
        return `exp(${args[0]})`;
      
      // Default (e.g., 'neg', 'inv', or if it's already a leaf)
      default:
        return `${op}(${args.join(', ')})`;
    }
  } catch (error) {
    console.error(`Failed to parse formula: ${s}`, error);
    return s; // Return the original string if parsing fails
  }
};
/**
 * NEW: Calls Gemini to find a "known, famous" formula and test its accuracy.
 * @param {string} dataSample - A CSV string sample of the data.
 *m* @param {string[]} inputCols - List of input column names.
 * @param {string} outputCol - The target output column name.
 * @returns {Promise<{found_known_formula: boolean, formula: string, accuracy_r_squared: number}>}
 */
const callGeminiForKnownFormula = async (dataSample, inputCols, outputCol) => {
  // Define the JSON schema we want the LLM to return
  const json_schema = {
    type: "OBJECT",
    properties: {
      "found_known_formula": {
        "type": "BOOLEAN",
        "description": "True if a known, famous formula is found, false otherwise."
      },
      "formula": {
        "type": "STRING",
        "description": "The simple, human-readable known formula (e.g., '2 * pi * sqrt(L / g)') or an empty string."
      },
      "accuracy_r_squared": {
        "type": "NUMBER",
        "description": "The R-squared accuracy of this formula against the data, from 0.0 to 1.0."
      }
    }
  };

  const prompt = `
    You are a world-class physicist and mathematician. Your task is to check if the following data *matches a famous, known formula*.

    - Input(s): ${inputCols.join(', ')}
    - Output: ${outputCol}
    - Data Sample:
      ${dataSample}

    1.  First, analyze the *column names*. Do they suggest a known relationship (e.g., 'Period' and 'Length' suggest the pendulum formula T = 2*pi*sqrt(L/g))?
    2.  Second, analyze the *data sample* to confirm and calculate the constants.
    3.  If you find a strong match to a *known, simple, elegant formula*, return that formula and its calculated R-squared accuracy. Use 'pi', 'g', 'e' as constants if applicable.
    4.  If the data does *not* match a known formula (e.g., it's just a generic polynomial or generic 'x'/'y' data), you *must* set "found_known_formula" to "false".

    Return *only* a JSON object matching the requested schema.
    `;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: json_schema
    }
  };

  try {
    const response = await axios.post(GEMINI_API_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000 // 30 second timeout
    });
    
    const result = response.data;
    const json_text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!json_text) {
      throw new Error("Invalid response structure from LLM.");
    }
    
    return JSON.parse(json_text);

  } catch (error) {
    console.error(`Gemini Known Formula check failed: ${error.message}`);
    // On failure, return a "not found" object to allow Gplearn to run
    return {
      found_known_formula: false,
      formula: "",
      accuracy_r_squared: 0
    };
  }
};

// --- 9. Server Start ---

const startServer = async () => {
  try {
    // Connect to MongoDB using the URI from .env
    await mongoose.connect(MONGO_URI);
    console.log("Successfully connected to MongoDB.");

    // Start Express server
    app.listen(PORT, () => {
      console.log(`Evosolve JS backend (MongoDB) running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB.", error);
    process.exit(1);
  }
};

startServer();