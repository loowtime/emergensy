import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
from main import StaffProtocolRisk, situation_log_filters

def make_risk(**o):
    b=dict(id="R-1",title="Testrisiko",probability=4,impact=4,residual_probability=2,residual_impact=2)
    b.update(o)
    return StaffProtocolRisk(**b)

def test_residual_exceeds():
    try:
        make_risk(probability=2,impact=2,residual_probability=4,residual_impact=4)
    except ValueError as e:
        assert "Restrisiko" in str(e)
    else:
        raise AssertionError("expected ValueError")

def test_residual_equal_ok():
    r=make_risk(probability=3,impact=3,residual_probability=3,residual_impact=3)
    assert r.probability==3

def test_accepted_requires_rationale():
    try:
        make_risk(status="accepted",treatment="accept",accepted_by="",acceptance_rationale="")
    except ValueError as e:
        assert "freigebende" in str(e) or "Begr" in str(e)
    else:
        raise AssertionError("expected ValueError")

def test_accepted_requires_accept_treatment():
    try:
        make_risk(status="accepted",treatment="reduce",accepted_by="Max",acceptance_rationale="ok")
    except ValueError as e:
        assert "accept" in str(e)
    else:
        raise AssertionError("expected ValueError")

def test_foreign_keys_enabled():
    conn=main.get_connection()
    try:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0]==1
    finally:
        conn.close()

from datetime import date
def test_situation_log_date_order():
    try:
        situation_log_filters(None,None,date(2025,2,1),date(2025,1,1),None)
    except Exception as e:
        assert "Startdatum" in str(e)
    else:
        raise AssertionError("expected HTTPException")
