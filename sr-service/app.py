import sys
import json
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from gplearn.genetic import SymbolicRegressor
from gplearn.functions import make_function

app = Flask(__name__)

# --- 1. PROTECTED FUNCTIONS (Prevent Crashes) ---
# These ensure that math errors (like dividing by zero) return a safe value instead of crashing.

def _protected_div(x1, x2):
    with np.errstate(divide='ignore', invalid='ignore'):
        return np.where(np.abs(x2) > 0.001, x1 / x2, 1.)

def _protected_sqrt(x1):
    # Returns sqrt of absolute value to avoid imaginary numbers
    return np.sqrt(np.abs(x1))

def _protected_log(x1):
    # Log of absolute value, returns 0 for values near 0
    with np.errstate(divide='ignore', invalid='ignore'):
        return np.where(np.abs(x1) > 0.001, np.log(np.abs(x1)), 0.)

def _protected_inv(x1):
    # 1/x, protected against 0
    with np.errstate(divide='ignore', invalid='ignore'):
        return np.where(np.abs(x1) > 0.001, 1. / x1, 0.)

def _protected_exp(x1):
    # Cap exponential at e^10 to prevent overflow (Infinity)
    with np.errstate(over='ignore'):
        return np.where(x1 < 10, np.exp(x1), np.exp(10))

# --- 2. REGISTER FUNCTIONS WITH GPLEARN ---
delta_div = make_function(function=_protected_div, name='div', arity=2)
delta_sqrt = make_function(function=_protected_sqrt, name='sqrt', arity=1)
delta_log = make_function(function=_protected_log, name='log', arity=1)
delta_inv = make_function(function=_protected_inv, name='inv', arity=1)
delta_exp = make_function(function=_protected_exp, name='exp', arity=1)

FUNCTION_MAP = {
    'add': 'add', 'sub': 'sub', 'mul': 'mul', 'div': delta_div,
    'sqrt': delta_sqrt, 'log': delta_log, 'abs': 'abs', 'neg': 'neg',
    'inv': delta_inv, 'sin': 'sin', 'cos': 'cos', 'tan': 'tan',
    'exp': delta_exp 
}

@app.route('/fit', methods=['POST'])
def fit_model():
    try:
        content = request.json
        data_json = content.get('data')
        function_names = content.get('function_set', [])
        target_col = content.get('output_column')

        if not data_json or not target_col:
            return jsonify({"error": "Missing data"}), 400

        df = pd.DataFrame(data_json)
        
        # --- 3. INJECT CONSTANTS (The "Lego Bricks") ---
        # We explicitly add columns for 0, Pi, e, G, and Integers 1-10.
        # This allows the AI to pick "7" directly instead of doing "1+1+1+1+1+1+1".
        
        df['const_pi'] = 3.14159
        df['const_e'] = 2.71828
        df['const_g'] = 9.8
        df['const_0'] = 0.0

        # Loop to create const_1 to const_10
        for i in range(1, 11):
            df[f'{i}'] = float(i)

        if target_col not in df.columns:
            return jsonify({"error": f"Target '{target_col}' not found"}), 400

        # Prepare X (Features) and y (Target)
        X = df.drop(columns=[target_col]).fillna(0)
        y = df[target_col].fillna(0)
        
        feature_names = list(X.columns)

        # Map string names to actual functions
        function_set = []
        for f in function_names:
            if f in FUNCTION_MAP: function_set.append(FUNCTION_MAP[f])
            else: function_set.append(f)
        
        # Fallback default
        if not function_set: function_set = ['add', 'sub', 'mul', delta_div]

        print(f"🔬 Running SR with features: {feature_names}", file=sys.stderr)

        # --- 4. ENGINE CONFIGURATION ---
        est = SymbolicRegressor(
            population_size=1000,      # High enough for variety
            generations=20,            # Fast enough for loops
            const_range=None,          # STRICTLY DISABLE random floats (e.g. 0.462)
            stopping_criteria=0.001,   # Stop if 99.9% accurate
            p_crossover=0.7,
            p_subtree_mutation=0.1,
            p_hoist_mutation=0.05,
            p_point_mutation=0.1,
            max_samples=0.9,
            verbose=0,
            # Parsimony: Penalize long formulas to avoid bloat
            parsimony_coefficient=0.02, 
            random_state=42,
            function_set=function_set,
            n_jobs=-1                  # Use ALL CPU cores for speed
        )

        est.fit(X, y)

        raw_formula = str(est._program)
        score = est.score(X, y)

        # Return formula and the feature names list (so Node can map X0 -> const_5 etc.)
        return jsonify({
            "formula": raw_formula,
            "accuracy": score,
            "feature_names": feature_names 
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        # Log error to stderr so it shows in Node console
        print(f"❌ Python Error: {str(e)}", file=sys.stderr)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run on port 5001
    app.run(host='0.0.0.0', port=5001, debug=True)