import pandas as pd

rec = pd.read_csv("recommendations.csv")
print(rec[(rec.location_id == "DIST_SIL") & (rec.sku_id == "N02BE")].to_string(index=False))
print(rec.status.value_counts())