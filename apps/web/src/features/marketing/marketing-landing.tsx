export function MarketingLanding({ contactEmail }: { contactEmail: string }) {
  return (
    <div className="marketing-page">
      <a className="marketing-skip-link" href="#marketing-main">
        Saltar al contenido
      </a>

      <header className="marketing-header">
        <p className="marketing-brand" translate="no">
          <span className="marketing-brand-mark" aria-hidden="true" />
          BlueCurrent
        </p>
        <p className="marketing-header-note">Operaciones bajo control</p>
      </header>

      <main id="marketing-main">
        <section className="marketing-hero" aria-labelledby="marketing-title">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">Software para centros de buceo</p>
            <h1 id="marketing-title">
              Más tiempo para el agua. Más claridad para tu equipo.
            </h1>
            <p className="marketing-lede">
              BlueCurrent reúne calendario, actividades y operación diaria en
              una vista pensada para quienes hacen que cada inmersión ocurra.
            </p>
            <a
              className="marketing-contact-link"
              href={`mailto:${contactEmail}`}
            >
              Solicitar acceso
              <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div className="marketing-visual" aria-hidden="true">
            <div className="marketing-visual-topline">
              <span>BlueCurrent / vista operativa</span>
              <span>Hoy</span>
            </div>
            <div className="marketing-visual-grid">
              <div className="marketing-visual-date">18 JUN</div>
              <div className="marketing-visual-line marketing-visual-line-main">
                <span />
                <strong>Salida de mañana</strong>
                <small>08:30 · 8 plazas</small>
              </div>
              <div className="marketing-visual-line marketing-visual-line-secondary">
                <span />
                <strong>Curso avanzado</strong>
                <small>11:15 · 4 plazas</small>
              </div>
              <div className="marketing-visual-axis" />
            </div>
            <div className="marketing-visual-footer">
              <span>Centro de buceo</span>
              <span>Planificación clara</span>
            </div>
          </div>
        </section>

        <section
          className="marketing-principles"
          aria-labelledby="principles-title"
        >
          <div className="marketing-section-intro">
            <p className="marketing-kicker">Un mismo pulso operativo</p>
            <h2 id="principles-title">
              La información que necesitas, cuando necesitas decidir.
            </h2>
          </div>
          <div className="marketing-principle-list">
            <article>
              <span className="marketing-index">01</span>
              <h3>Planifica sin perder el rumbo</h3>
              <p>
                Ordena tus salidas y actividades desde una vista compartida.
              </p>
            </article>
            <article>
              <span className="marketing-index">02</span>
              <h3>Coordina a tu equipo</h3>
              <p>
                Convierte el plan del día en una operación que todos entienden.
              </p>
            </article>
            <article>
              <span className="marketing-index">03</span>
              <h3>Trabaja con contexto</h3>
              <p>Ten a mano el pulso de tu centro para decidir con calma.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <span translate="no">BlueCurrent</span>
        <span>Gestión para centros de buceo</span>
      </footer>
    </div>
  );
}
