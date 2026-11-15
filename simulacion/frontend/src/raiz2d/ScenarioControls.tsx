import { Choice } from './components';
import { PERIOD_LABEL, SCENARIO_HINT, SCENARIOS } from './format';
import type { Selection } from './state';
import type { PeriodId, Scenario } from './types';

/** Los dos ejes del análisis, siempre separados: fase ENSO de la campaña de decisión y periodo. */
export function ScenarioControls({
  selection,
  update,
}: {
  selection: Selection;
  update: (patch: Partial<Selection>) => void;
}) {
  return (
    <div className="controls" role="group" aria-label="Escenario y periodo">
      <Choice<Scenario>
        legend="Fase de la campaña de decisión"
        name="escenario"
        value={selection.scenario}
        onChange={(scenario) => {
          update({ scenario });
        }}
        options={SCENARIOS.map((s) => ({ value: s, label: s, hint: SCENARIO_HINT[s] }))}
      />
      <Choice<PeriodId>
        legend="Periodo de comparación"
        name="periodo"
        value={selection.period}
        onChange={(period) => {
          update({ period });
        }}
        options={(['all', 'historical', 'recent'] as const).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
      />
    </div>
  );
}
