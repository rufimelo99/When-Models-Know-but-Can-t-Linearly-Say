"""Build docs/traces/data/explorer.json from results_checkpoint_emnlp/raw_data.

Run from the repo root:  python docs/tools/export_site_data.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "results_checkpoint_emnlp" / "raw_data"
OUT = ROOT / "docs" / "traces" / "data" / "explorer.json"

MODELS = {
    "qwen-7b": ("Qwen2.5-7B-Instruct", "Qwen", 7),
    "qwen-coder-7b": ("Qwen2.5-Coder-7B-Instruct", "Qwen", 7),
    "qwen-14b": ("Qwen2.5-14B-Instruct", "Qwen", 14),
    "codellama-7b": ("CodeLlama-7B-Instruct", "CodeLlama", 7),
    "codellama-13b": ("CodeLlama-13B-Instruct", "CodeLlama", 13),
    "starcoder2-7b": ("StarCoder2-7B", "StarCoder2", 7),
    "starcoder2-15b": ("StarCoder2-15B", "StarCoder2", 15),
    "deepseek-6.7b": ("DeepSeek-Coder-6.7B-Instruct", "DeepSeek", 6.7),
}
DATASETS = {"deltasecommits": "DeltaSecommits", "precisebugs": "PreciseBugs", "sven": "SVEN"}
FAMILIES = ["memory_safety", "injection", "resource", "info_disclosure", "control_flow"]

# Table 1 of the paper: length-controlled binary probe, peak layer / AUROC per model.
LENGTH_CONTROLLED = {
    "codellama-7b": (11, 0.644),
    "codellama-13b": (11, 0.646),
    "deepseek-6.7b": (11, 0.643),
    "qwen-7b": (19, 0.654),
    "qwen-coder-7b": (19, 0.657),
    "qwen-14b": (27, 0.646),
    "starcoder2-7b": (7, 0.644),
    "starcoder2-15b": (7, 0.641),
}


def load(name):
    path = RAW / name
    return json.loads(path.read_text()) if path.exists() else None


def pairwise(model, dataset):
    # Un-prefixed files hold the DeltaSecommits run for the models that have no prefixed copy.
    candidates = [f"{dataset}_{model}_cwe_pairwise_probe.json"]
    if dataset == "deltasecommits":
        candidates.append(f"{model}_cwe_pairwise_probe.json")
    for name in candidates:
        d = load(name)
        if d:
            return {
                "cwes": d["cwe_types"],
                "layers": {
                    L: [[round(v, 3) for v in row] for row in v["auroc_matrix"]]
                    for L, v in d["layers"].items()
                },
            }
    return None


def main():
    out = {"datasets": DATASETS, "families": FAMILIES, "models": {}}
    for key, (label, family, size) in MODELS.items():
        geo = load(f"{key}_direction_geometry.json")
        uni = load(f"{key}_cwe_universality.json")
        entry = {"label": label, "family": family, "size_b": size}
        if geo:
            entry["n_pairs"] = geo["n_pairs"]
            entry["alignment"] = {L: round(v["pct_aligned"], 2) for L, v in geo["layers"].items()}
        if uni:
            entry["family_pairs"] = {f: v["n_pairs"] for f, v in uni["family_stats"].items()}
            entry["transfer"] = {
                L: {k: round(v, 1) for k, v in d.items()} for L, d in uni["transfer_by_layer"].items()
            }
        if key in LENGTH_CONTROLLED:
            entry["length_controlled"] = {"layer": LENGTH_CONTROLLED[key][0], "auroc": LENGTH_CONTROLLED[key][1]}
        pw = {ds: pairwise(key, ds) for ds in DATASETS}
        entry["pairwise"] = {k: v for k, v in pw.items() if v}
        out["models"][key] = entry

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")
    for k, m in out["models"].items():
        print(k, "alignment" in m, "transfer" in m, list(m["pairwise"]))


if __name__ == "__main__":
    main()
