from apply_diff import check_dependency_bump


def test_check_dependency_bump_pass():
    bump = check_dependency_bump(
        r"b6ebb78e build(deps): bump github.com/cosmos/rosetta from 0.50.10 to 0.50.11 (#3037)"
    )
    assert bump == {
        "dep": "github.com/cosmos/rosetta",
        "target": "0.50.11"
    }


def test_check_dependency_bump_fail():
    assert check_dependency_bump("pattern not found") is False
