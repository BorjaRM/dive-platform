import styles from './marketing.module.css';

export function MarketingLanding({ contactEmail }: { contactEmail: string }) {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#marketing-main">
        Saltar al contenido
      </a>

      <header className={styles.header}>
        <p className={styles.brand} translate="no">
          <span className={styles.brandMark} aria-hidden="true" />
          BlueCurrent
        </p>
        <p className={styles.headerNote}>Operaciones bajo control</p>
      </header>

      <main id="marketing-main">
        <section className={styles.hero} aria-labelledby="marketing-title">
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Software para centros de buceo</p>
            <h1 id="marketing-title">
              Más tiempo para el agua. Más claridad para tu equipo.
            </h1>
            <p className={styles.lede}>
              BlueCurrent reúne calendario, actividades y operación diaria en
              una vista pensada para quienes hacen que cada inmersión ocurra.
            </p>
            <a className={styles.contactLink} href={`mailto:${contactEmail}`}>
              Solicitar acceso
              <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div className={styles.visual} aria-hidden="true">
            <div className={styles.visualTopline}>
              <span>BlueCurrent / vista operativa</span>
              <span>Hoy</span>
            </div>
            <div className={styles.visualGrid}>
              <div className={styles.visualDate}>18 JUN</div>
              <div className={`${styles.visualLine} ${styles.visualLineMain}`}>
                <span />
                <strong>Salida de mañana</strong>
                <small>08:30 · 8 plazas</small>
              </div>
              <div
                className={`${styles.visualLine} ${styles.visualLineSecondary}`}
              >
                <span />
                <strong>Curso avanzado</strong>
                <small>11:15 · 4 plazas</small>
              </div>
              <div className={styles.visualAxis} />
            </div>
            <div className={styles.visualFooter}>
              <span>Centro de buceo</span>
              <span>Planificación clara</span>
            </div>
          </div>
        </section>

        <section
          className={styles.principles}
          aria-labelledby="principles-title"
        >
          <div className={styles.sectionIntro}>
            <p className={styles.kicker}>Un mismo pulso operativo</p>
            <h2 id="principles-title">
              La información que necesitas, cuando necesitas decidir.
            </h2>
          </div>
          <div className={styles.principleList}>
            <article>
              <span className={styles.index}>01</span>
              <h3>Planifica sin perder el rumbo</h3>
              <p>
                Ordena tus salidas y actividades desde una vista compartida.
              </p>
            </article>
            <article>
              <span className={styles.index}>02</span>
              <h3>Coordina a tu equipo</h3>
              <p>
                Convierte el plan del día en una operación que todos entienden.
              </p>
            </article>
            <article>
              <span className={styles.index}>03</span>
              <h3>Trabaja con contexto</h3>
              <p>Ten a mano el pulso de tu centro para decidir con calma.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span translate="no">BlueCurrent</span>
        <span>Gestión para centros de buceo</span>
      </footer>
    </div>
  );
}
