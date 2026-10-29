<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import "#lib/components/dashboard/dashboard-shell.css";

  let retrying = $state(false);

  function focusHeading(selector: string): void {
    const target = document.querySelector<HTMLElement>(selector);
    target?.focus();
    target?.scrollIntoView({ block: "nearest" });
  }

  async function retry(): Promise<void> {
    if (retrying) return;
    retrying = true;
    // An unmatched URL may not be in the generated path union. Resolve it as
    // a literal pathname after removing the base and leading slash. The dot
    // prefix keeps even a second leading slash out of route-ID mode.
    const prefix = resolve("/").replace(/\/$/, "");
    const retryPath =
      `./${page.url.pathname.slice(prefix.length).replace(/^\//, "")}${page.url.search}${page.url.hash}` as "";
    try {
      await goto(resolve(retryPath), {
        refreshAll: true,
        reset: false,
        replace: true,
      });
      focusHeading(
        "#selected-period-heading, #empty-period-heading, #page-error-heading",
      );
    } catch {
      focusHeading("#page-error-heading");
    } finally {
      retrying = false;
    }
  }
</script>

<main class="dashboard-page">
  <section class="error-shell" aria-labelledby="page-error-heading">
    <h1 id="page-error-heading" tabindex="-1">読み込みに失敗しました</h1>
    <p>{page.error?.message ?? "ページを読み込めませんでした。"}</p>
    <button type="button" aria-disabled={retrying} onclick={retry}
      >再読み込み</button
    >
  </section>
</main>

<style>
  .error-shell {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    box-shadow: var(--elevation-card);
    display: grid;
    gap: 1rem;
    justify-items: start;
    padding: var(--panel-padding-block) var(--panel-padding-inline);
  }
  h1 {
    font-size: 1.5rem;
    font-weight: 700;
  }
  button {
    background: var(--primary);
    border-radius: var(--radius-md);
    color: var(--primary-foreground);
    cursor: pointer;
    font-weight: 800;
    min-height: var(--control-height);
    padding: 0 1rem;
  }
</style>
