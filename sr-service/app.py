import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from gplearn.genetic import SymbolicRegressor
from sklearn.metrics import r2_score
import warnings

# Suppress warnings from gplearn
warnings.filterwarnings("ignore", category=UserWarning)

# Initialize the Flask app
app = Flask(__name__)

@app.route('/fit', methods=['POST'])
def fit_model():
    try:
        # 1. Parse data from the Node.js request
        json_data = request.json
        data_list = json_data['data']            # List of { 'x': 1, 'y': 5 }
        output_column = json_data['output_column']  # e.g., 'y'
        function_set = json_data['function_set']    # e.g., ['add', 'mul', 'sqrt']

        # 2. Prepare data for gplearn
        # Convert the list of dicts into a Pandas DataFrame
        df = pd.DataFrame(data_list)
        
        # --- NEW CODE: Add named constants as features ---
        # This makes 'pi', 'e', and 'g' available as variables for the formula
        df['pi'] = np.pi
        df['e'] = np.e
        df['g'] = 9.81  # Standard gravity
        # --- END OF NEW CODE ---

        # Separate features (X) and the target (y)
        y = df[output_column].values
        X_df = df.drop(columns=[output_column])
        X = X_df.values
        
        # Get feature names for gplearn (e.g., ['x1', 'pi', 'e', 'g'])
        feature_names = X_df.columns.tolist()

        # 3. Configure and run the Symbolic Regressor
        sr = SymbolicRegressor(
            population_size=500,
            generations=20,
            function_set=function_set,
            feature_names=feature_names,
            
            # --- MODIFIED CODE: Disable float constants ---
            const_range=None, # This STOPS gplearn from inventing numbers like 0.943
            # --- END OF MODIFIED CODE ---

            metric='mean absolute error', # Robust metric for fitting
            stopping_criteria=0.01,
            random_state=42,
            verbose=0
        )

        sr.fit(X, y)

        # 4. Get the results
        formula = str(sr._program)
        
        # Calculate R-squared score for a simple accuracy metric
        y_pred = sr.predict(X)
        accuracy = r2_score(y, y_pred)

        # 5. Return the results to Node.js
        return jsonify({
            'formula': formula,
            'accuracy': accuracy
        })

    except Exception as e:
        # Send a proper error back to the Node.js server
        return jsonify({'error': str(e)}), 500

# Run the Flask server
if __name__ == '__main__':
    # We run on port 5001 (Node.js can be 5000, React 3000)
    app.run(port=5001, debug=True)