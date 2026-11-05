# Audit all requests (writes output.csv, log.txt, code\results.json), score the samples, run the tests.
# Usage: .\scripts\run_audit.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
py code\run_audit.py
py evaluation\evaluate.py
py -W ignore::ResourceWarning -m unittest discover -s tests -v
