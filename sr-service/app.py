import sys
import json
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from gplearn.genetic import SymbolicRegressor
# IMPORT THIS: Necessary to wrap custom functions
from gplearn.functions import make_function

app = Flask(__name__)

# --- 1. DEFINE PROTECTED LOGIC ---
# Standard gplearn functions are protected, but defining them explicitly 
# ensures we control the behavior (e.g., avoiding log(0) crashes).

def _protected_div(x1, x2):
    """Returns 1 if dividing by zero."""
    with np.errstate(divide='ignore', invalid='ignore'):
        return np.where(np.abs(x2) > 0.001, x1 / x2, 1.)

def _protected_sqrt(x1):
    """Returns sqrt(|x|) to avoid domain errors."""
    return np.sqrt(np.abs(x1))

def _protected_log(x1):
    """Returns log(|x|) or 0 if x is near 0."""
    with np.errstate(divide='ignore', invalid='ignore'):
        return np.where(np.abs(x1) > 0.001, np.log(np.abs(x1)), 0.)

def _protected_inv(x1):
    """Returns 1/x, protected against 0."""
    with np.errstate(divide='ignore', invalid='ignore'):
        return np.where(np.abs(x1) > 0.001, 1. / x1, 0.)

# --- 2. WRAP FUNCTIONS (The Fix) ---
# We must tell gplearn the 'arity' (number of inputs) for each function.
delta_div = make_function(function=_protected_div, name='div', arity=2)
delta_sqrt = make_function(function=_protected_sqrt, name='sqrt', arity=1)
delta_log = make_function(function=_protected_log, name='log', arity=1)
delta_inv = make_function(function=_protected_inv, name='inv', arity=1)

# Map strings to these WRAPPED functions
FUNCTION_MAP = {
    'add': 'add',
    'sub': 'sub',
    'mul': 'mul',
    'div': delta_div,  # Uses the wrapped function
    'sqrt': delta_sqrt,
    'log': delta_log,
    'abs': 'abs',
    'neg': 'neg',
    'inv': delta_inv,
    'sin': 'sin',
    'cos': 'cos',
    'tan': 'tan',
    'exp': 'exp'       # 'exp' is usually safe enough, but can overflow. 
                       # gplearn's default 'exp' is NOT protected against overflow, 
                       # but usually just returns inf which numpy handles.
}

@app.route('/fit', methods=['POST'])
def fit_model():
    try:
        content = request.json
        data_json = content.get('data')
        function_names = content.get('function_set', ['add', 'sub', 'mul', 'div'])
        target_col = content.get('output_column')

        if not data_json or not target_col:
            return jsonify({"error": "Missing data or target column"}), 400

        df = pd.DataFrame(data_json)
        
        if target_col not in df.columns:
            return jsonify({"error": f"Target column '{target_col}' not found"}), 400

        X = df.drop(columns=[target_col]).fillna(0)
        y = df[target_col].fillna(0)

        # Build the function set list
        function_set = []
        for f in function_names:
            if f in FUNCTION_MAP:
                function_set.append(FUNCTION_MAP[f])
            else:
                # If the backend sends a function we didn't map (like 'sin' if not in map),
                # try passing the string directly.
                function_set.append(f)
        
        # Safety fallback
        if not function_set:
            function_set = ['add', 'sub', 'mul', delta_div]

        # Debug print
        print(f"🔬 Running SR with {len(function_set)} functions", file=sys.stderr)

        est = SymbolicRegressor(
            population_size=1000,
            generations=15, 
            stopping_criteria=0.01,
            p_crossover=0.7,
            p_subtree_mutation=0.1,
            p_hoist_mutation=0.05,
            p_point_mutation=0.1,
            max_samples=0.9,
            verbose=0,
            parsimony_coefficient=0.001, # Penalize bloated formulas slightly
            random_state=42,
            function_set=function_set
        )

        est.fit(X, y)

        raw_formula = str(est._program)
        score = est.score(X, y)

        return jsonify({
            "formula": raw_formula,
            "accuracy": score,
            "mse": -1 
        })

    except Exception as e:
        # Print the ACTUAL error to your terminal so you can see it next time
        import traceback
        traceback.print_exc()
        print(f"❌ Python Error: {str(e)}", file=sys.stderr)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)