# Original public pharmacy benchmark

`pharma-salesdaily.csv` is the existing project source snapshot, retained with its
original dates, eight ATC categories and fractional publisher quantities.

Source and attribution: Milan Zdravkovic, *Pharma Sales Data*, Kaggle:
https://www.kaggle.com/datasets/milanzdravkovic/pharma-sales-data

The companion manifest records the source fingerprint and the catalogue licence
(CC BY-NC 4.0; verify permission before commercial deployment). The source publisher
preprocessed missing values/outliers. The quantities are category sales, not
independently verified product base units or actual Assam distributor demand.

This snapshot is used only by `grd.benchmark`; it is never imported into the Assam
operating ledger. The existing forecast evaluator selects on validation MAE and
reports separate final held-out 1/2/4-week metrics with recursive fixed-origin
predictions. Four test origins per horizon are limited evidence; uncertainty and
local transferability are not guaranteed.
