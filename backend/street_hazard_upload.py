import pandas as pd 
import numpy as np 

def street_hazard_upload():
    # Load the dataset
    df = pd.read_csv("backend/pothole_per_coordinate.csv")

    df = df[df["pothole_sum"] != 0]

    return