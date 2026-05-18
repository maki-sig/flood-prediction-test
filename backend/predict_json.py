import sys
import os
import json
import joblib
import pandas as pd

def main():
    try:
        # Read JSON string from standard input
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"error": "No input provided"}), file=sys.stderr)
            sys.exit(1)
            
        features_list = json.loads(input_data)
        
        # Load the model
        model_path = os.path.join(os.path.dirname(__file__), "..", "model", "flood_model.pkl")
        if not os.path.exists(model_path):
            print(json.dumps({"error": f"Model not found at {model_path}"}), file=sys.stderr)
            sys.exit(1)
            
        predict_flood = joblib.load(model_path)
        
        # Convert features to pandas DataFrame
        df = pd.DataFrame(features_list)
        
        # Ensure correct column ordering
        cols = ["rain_intensity_1h", "rain_accum_6h", "rain_accum_24h"]
        for col in cols:
            if col not in df.columns:
                df[col] = 0.0
                
        df = df[cols]
        
        # Predict probability of flooding (class 1)
        # [0][1] is probability of flooding for first sample, so we get it for all samples
        probabilities = predict_flood.predict_proba(df)
        flood_probs = [float(p[1]) for p in probabilities]
        
        # Output results as a JSON list to stdout
        print(json.dumps(flood_probs))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
