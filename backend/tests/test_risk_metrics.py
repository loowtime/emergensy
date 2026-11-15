import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from risk_metrics import risk_level_for_score, is_plausible_residual


def test_thresholds_match_frontend():
    assert risk_level_for_score(0)["label"] == "Niedrig"
    assert risk_level_for_score(1)["label"] == "Niedrig"
    assert risk_level_for_score(4)["label"] == "Niedrig"
    assert risk_level_for_score(5)["label"] == "Beobachten"
    assert risk_level_for_score(9)["label"] == "Beobachten"
    assert risk_level_for_score(10)["label"] == "Hoch"
    assert risk_level_for_score(15)["label"] == "Hoch"
    assert risk_level_for_score(16)["label"] == "Kritisch"
    assert risk_level_for_score(25)["label"] == "Kritisch"


def test_plausible_residual():
    assert is_plausible_residual(25, 25) is True
    assert is_plausible_residual(25, 10) is True
    assert is_plausible_residual(10, 25) is False
