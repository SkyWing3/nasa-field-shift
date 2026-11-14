import { FARM_TOOLS } from '../../interaction';
import { useSimulationStore, useUiStore } from '../../state';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import styles from './SidePanel.module.css';

export function SidePanel() {
  const activeToolId = useUiStore((s) => s.activeToolId);
  const setActiveTool = useUiStore((s) => s.setActiveTool);
  const scenario = useSimulationStore((s) => s.scenario);

  return (
    <aside className={styles.panel} aria-label="Panel de herramientas" data-testid="side-panel">
      <section className={styles.section} aria-labelledby="tools-heading">
        <h2 id="tools-heading" className={styles.heading}>
          Herramientas agrícolas
        </h2>
        <ul className={styles.tools}>
          {FARM_TOOLS.map((tool) => {
            const available = tool.availability === 'available';
            const active = activeToolId === tool.id;
            return (
              <li key={tool.id}>
                <button
                  type="button"
                  className={styles.tool}
                  disabled={!available}
                  aria-pressed={active}
                  title={available ? tool.description : `${tool.label}: disponible próximamente`}
                  onClick={() => {
                    setActiveTool(active ? null : tool.id);
                  }}
                >
                  <span className={styles.toolIcon}>
                    <Icon name={tool.id} size={18} />
                  </span>
                  <span className={styles.toolText}>
                    <span className={styles.toolHeader}>
                      <span className={styles.toolLabel}>{tool.label}</span>
                      {available ? null : <span className={styles.tag}>Próximamente</span>}
                    </span>
                    <span className={styles.toolDescription}>{tool.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="scenario-heading">
        <h2 id="scenario-heading" className={styles.heading}>
          Escenario
        </h2>
        {scenario ? (
          <p>{scenario.name}</p>
        ) : (
          <EmptyState icon="layers" title="Ningún escenario cargado">
            Los escenarios de simulación se habilitarán junto con el motor agronómico.
          </EmptyState>
        )}
      </section>

      <section className={styles.section} aria-labelledby="plot-heading">
        <h2 id="plot-heading" className={styles.heading}>
          Parcela seleccionada
        </h2>
        <EmptyState icon="map" title="Ninguna parcela seleccionada">
          Cuando la granja tenga parcelas, selecciona una en la escena para consultar su suelo y su
          cultivo.
        </EmptyState>
      </section>
    </aside>
  );
}
