<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import "$lib/components/dashboard/dashboard-shell.css";

  let retrying = $state(false);

  async function retry(): Promise<void> {
    if (retrying) return;
    retrying = true;
    try {
      await goto(page.url, {
        invalidateAll: true,
        keepFocus: true,
        noScroll: true,
        replaceState: true,
      });
      const target = document.querySelector<HTMLElement>(
        "#selected-period-heading, #empty-period-heading, #page-error-heading",
      );
      target?.focus();
      target?.scrollIntoView({ block: "nearest" });
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
    background: #fffdf8;
    border: 1px solid #e4ddd2;
    border-radius: 14px;
    box-shadow: 0 18px 60px rgba(51, 38, 26, 0.07);
    padding: 1.15rem 1.25rem;
  }
  h1 {
    margin-top: 0;
  }
  button {
    background: #2f6d3b;
    border: 0;
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    min-height: 2.65rem;
    padding: 0 1rem;
  }
</style>
