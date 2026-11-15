import pytest

from app.engine.rotation_request import prepare_rotation_request


def test_rotation_request_defaults_to_first_position() -> None:
    assert prepare_rotation_request("A").start_position == 0


def test_rotation_request_preserves_explicit_start_position() -> None:
    request = prepare_rotation_request("B", start_position=2)
    assert request.sequence_id == "B"
    assert request.start_position == 2


@pytest.mark.parametrize("position", [-1, True, 3])
def test_rotation_request_rejects_invalid_positions(position: int) -> None:
    with pytest.raises(ValueError, match="start_position"):
        prepare_rotation_request("A", start_position=position)
