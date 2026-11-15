"""Entrada de D1-5: secuencia y posición inicial, sin E/S ni generación de ciencia.

Las tres posiciones están aprobadas en PROMPT_DEV1_IA.md y content/p6/rotations.json.
El generador por lotes conserva los parámetros ausentes como null.
"""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class RotationRequest:
    sequence_id: Literal["A", "B", "C"]
    start_position: int = 0

    def __post_init__(self) -> None:
        if self.sequence_id not in ("A", "B", "C"):
            raise ValueError("La secuencia debe ser A, B o C")
        if type(self.start_position) is not int or not 0 <= self.start_position <= 2:
            raise ValueError("start_position debe ser un entero de 0 a 2")


def prepare_rotation_request(
    sequence_id: Literal["A", "B", "C"], *, start_position: int = 0
) -> RotationRequest:
    """Conserva la posición solicitada, sin ejecutar el evaluador."""
    return RotationRequest(sequence_id=sequence_id, start_position=start_position)
