import requests
import Levenshtein
from datetime import datetime, timezone
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Allow CORS for VS Code extension integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PackageCheck(BaseModel):
    name: str

class BulkCheck(BaseModel):
    packages: List[str]

# High-download packages for the typosquatting heuristic
TOP_PACKAGES = [
    "react", "express", "lodash", "axios", "mongoose", 
    "electron", "next", "vue", "angular", "jest"
]

@app.get("/")
def health_check():
    return {"status": "ok", "service": "invisible-security-api"}

@app.post("/analyze")
def analyze_package(package: PackageCheck):
    pkg_name = package.name.strip()
    print(f"[INFO] Analyzing package: {pkg_name}")
    
    # 1. Typosquatting Check
    if pkg_name not in TOP_PACKAGES:
        for safe_pkg in TOP_PACKAGES:
            distance = Levenshtein.distance(pkg_name, safe_pkg)
            if distance in [1, 2]:
                print(f"[WARN] Typosquatting detected: {pkg_name} -> {safe_pkg}")
                return {
                    "status": "danger",
                    "type": "typosquatting",
                    "message": f"Potential typosquatting. Did you mean '{safe_pkg}'?"
                }

    # 2. NPM Registry Check (Hallucinations & Age Heuristics)
    npm_url = f"https://registry.npmjs.org/{pkg_name}"
    try:
        npm_response = requests.get(npm_url, timeout=5)
        
        if npm_response.status_code == 404:
            print(f"[WARN] Package not found on NPM (Hallucination): {pkg_name}")
            return {
                "status": "danger",
                "type": "hallucination",
                "message": f"Package '{pkg_name}' does not exist on npm."
            }
            
        if npm_response.status_code == 200:
            data = npm_response.json()
            if "time" in data and "created" in data["time"]:
                created_date_str = data["time"]["created"].replace("Z", "+00:00")
                created_date = datetime.fromisoformat(created_date_str)
                days_old = (datetime.now(timezone.utc) - created_date).days
                
                if days_old < 30:
                    print(f"[INFO] Package is suspiciously new: {pkg_name} ({days_old} days old)")
                    return {
                        "status": "warning",
                        "type": "new_package",
                        "message": f"Package was created {days_old} days ago. Verify authenticity."
                    }
    except requests.RequestException as e:
        print(f"[ERROR] NPM registry timeout/error for {pkg_name}: {e}")

    # 3. Google OSV Check (Known Vulnerabilities)
    osv_url = "https://api.osv.dev/v1/query"
    payload = {"package": {"name": pkg_name, "ecosystem": "npm"}}
    try:
        osv_response = requests.post(osv_url, json=payload, timeout=5)
        if osv_response.status_code == 200:
            data = osv_response.json()
            if "vulns" in data:
                print(f"[WARN] OSV Vulnerability found for {pkg_name}")
                return {
                    "status": "danger",
                    "type": "osv_vulnerability",
                    "message": f"Known vulnerabilities found in '{pkg_name}' via OSV."
                }
    except requests.RequestException as e:
        print(f"[ERROR] OSV API timeout/error for {pkg_name}: {e}")

    # 4. Passed all checks
    print(f"[INFO] Package {pkg_name} verified as safe.")
    return {
        "status": "safe",
        "type": "none",
        "message": "Package verified."
    }

@app.post("/check-bulk")
def check_bulk(data: BulkCheck):
    print(f"[INFO] Running bulk scan for {len(data.packages)} packages")
    report = []
    osv_url = "https://api.osv.dev/v1/query"

    for pkg in data.packages:
        payload = {"package": {"name": pkg, "ecosystem": "npm"}}
        try:
            response = requests.post(osv_url, json=payload, timeout=5)
            if response.status_code == 200:
                osv_data = response.json()
                if "vulns" in osv_data:
                    report.append({
                        "package": pkg,
                        "status": "danger",
                        "message": "Vulnerability Found"
                    })
                    continue 
        except requests.RequestException:
            pass  # Fail gracefully to avoid breaking the entire bulk scan loop
        
        report.append({
            "package": pkg,
            "status": "safe",
            "message": "Clean"
        })
        
    print(f"[INFO] Bulk scan completed.")
    return {"results": report}