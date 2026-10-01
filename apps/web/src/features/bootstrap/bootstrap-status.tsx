import styles from './bootstrap.module.css';

export function BootstrapStatus({
  kicker,
  title,
  body,
}: Readonly<{ kicker: string; title: string; body: string }>) {
  return (
    <main className={styles.statusPage}>
      <section className={styles.notice} role="status">
        <p className={styles.kicker}>{kicker}</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}
