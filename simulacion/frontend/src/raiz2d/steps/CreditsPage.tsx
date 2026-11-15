import { StepHeading } from '../components';
import type { Bundle } from '../types';

/** Markdown mínimo de credits.json: tablas, listas y párrafos (sin HTML incrustado). */
function PlainMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const clean = (s: string) => s.replace(/\*\*|`|\*/g, '').replace(/^>\s*/, '').trim();
  const table = lines.filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l));
  const cells = (l: string) => l.split('|').slice(1, -1).map(clean);
  const items = lines.filter((l) => l.startsWith('- '));
  const paragraphs = lines.filter((l) => l.trim() && !l.startsWith('|') && !l.startsWith('- '));
  return (
    <>
      {table.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {cells(table[0] ?? '').map((c, i) => (
                  <th key={i} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.slice(1).map((row, i) => (
                <tr key={i}>
                  {cells(row).map((c, k) => (
                    <td key={k}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {paragraphs.map((p, i) => (
        <p key={i} className="measure">
          {clean(p)}
        </p>
      ))}
      {items.length ? (
        <ul className="limits">
          {items.map((l, i) => (
            <li key={i}>{clean(l.slice(2))}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function CreditsPage({ data }: { data: Bundle }) {
  const { credits, catalog } = data;
  return (
    <>
      <StepHeading
        id="creditos"
        title="Créditos y límites"
        lead="Fuentes, herramientas, uso de inteligencia artificial y alcance del análisis."
      />
      <p className="back-link">
        <a href="/">Volver al recorrido</a>
      </p>
      <section className="block">
        <h2>Tecnología</h2>
        <p className="measure">
          {credits.framework}, {credits.library} y {credits.backend}. Los cálculos se ejecutan antes de publicar; la
          página solo lee archivos precalculados y no consulta a NASA, NOAA ni servicios de voz.
        </p>
        <p className="measure">
          Tipografías Alegreya y Alegreya Sans (Huerta Tipográfica), licencia SIL Open Font License 1.1, servidas
          desde este mismo sitio.
        </p>
        <p className="measure">Asistentes usados: Claude (Anthropic), ChatGPT y Codex (OpenAI), Gemini (Google).</p>
      </section>
      {credits.sections.map((s) => (
        <section className="block" key={s.title}>
          <h2>{s.title}</h2>
          <PlainMarkdown text={s.markdown} />
        </section>
      ))}
      <section className="block">
        <h2>Alcance de esta corrida</h2>
        <p className="measure">
          El análisis histórico de Niño fuerte fue reproducido por P6 y Dev 1. Los nueve casos por cuatro presupuestos
          de agua vienen de un balance diario FAO-56 ({catalog.model_version}) con supuestos explícitos, pendiente de
          revisión agronómica de P6. El audio en español no se incluyó en esta entrega. La autorización escrita del
          productor se conserva fuera de los archivos públicos.
        </p>
        <h3>Supuestos del modelo</h3>
        <ul className="limits">
          {catalog.assumptions.map((a) => (
            <li key={a.source}>
              <code>{a.source}</code>:{' '}
              {a.value === null ? 'sin dato' : typeof a.value === 'string' ? a.value : JSON.stringify(a.value)}
              {a.unit ? ` ${a.unit}` : ''}
              {a.reference ? `. Fuente: ${a.reference}` : ''}
              {a.note ? `. ${a.note}` : ''}
            </li>
          ))}
        </ul>
        <h3>Límites del cálculo</h3>
        <ul className="limits">
          {catalog.model_limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="measure">
          <a href="/raiz/downloads/obrajes-D1-2-privacidad-2026-11-14.zip" download>
            Descargar paquete NASA POWER con sumas de verificación
          </a>
        </p>
        <p className="measure">
          <a href="/raiz/data/enso_campaigns.json" download>
            Descargar clasificación ENSO por campaña
          </a>
        </p>
        <p className="measure">
          <a href="/raiz/data/results.json" download>
            Descargar resultados del balance
          </a>
        </p>
      </section>
    </>
  );
}
