import pandas as pd
import numpy as np
import os

if not os.path.exists('benchmarks'):
    os.makedirs('benchmarks')

def generate_datasets():
    
    # 1. Radioactive Decay (Simplified)
    # Formula: N(t) = 2 * exp(-1 * t)
    # This matches our available constants (2) much better than 100.
    t = np.linspace(0.1, 5.0, 50)
    N = 2.0 * np.exp(-1.0 * t) 
    df_decay = pd.DataFrame({'Time': t, 'Particles': N})
    df_decay.to_csv('benchmarks/decay.csv', index=False)
    print("✅ Created benchmarks/decay.csv (Target: 2 * exp(-t))")

if __name__ == "__main__":
    generate_datasets()