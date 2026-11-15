"""Entrada preparada para D1-5; no ejecuta simulaciones ni enumera los nueve casos.

P6 mantiene pendiente la aprobación de la líder. Las secuencias y los parámetros
agronómicos del borrador tampoco están completos. El motor se implementará en su fase.
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
        if type(self.start_position) is not int or self.start_position < 0:
            raise ValueError("start_position debe ser un entero no negativo")


def prepare_rotation_request(
    sequence_id: Literal["A", "B", "C"], *, start_position: int = 0
) -> RotationRequest:
    """Conserva la posición solicitada para el futuro evaluador, sin ejecutarlo."""
    return RotationRequest(sequence_id=sequence_id, start_position=start_position)
