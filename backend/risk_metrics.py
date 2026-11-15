from __future__ import annotations


RISK_LEVELS = (
    ("Niedrig", "low", 1),
    ("Beobachten", "guarded", 5),
    ("Hoch", "high", 10),
    ("Kritisch", "critical", 16),
)


def risk_level_for_score(score):
    if isinstance(score, bool) or not isinstance(score, int):
        raise TypeError("score must be an int")
    if score < 0:
        raise ValueError("score must not be negative")
    level = None
    for label, css_class, threshold in reversed(RISK_LEVELS):
        if score >= threshold:
            level = (label, css_class, threshold)
            break
    if level is None:
        level = RISK_LEVELS[0]
    label, css_class, threshold = level
    return {"label": label, "className": css_class, "threshold": threshold, "score": score}


def gross_score(probability, impact):
    return probability * impact


def residual_score(residual_probability, residual_impact):
    return residual_probability * residual_impact


def is_plausible_residual(gross, residual):
    return residual <= gross
