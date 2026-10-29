<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import * as Card from "#lib/components/ui/card/index.ts";
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
  <section aria-labelledby="page-error-heading">
    <Card.Root class="gap-4">
      <Card.Header>
        <h1 id="page-error-heading" class="text-2xl font-bold" tabindex="-1">
          読み込みに失敗しました
        </h1>
      </Card.Header>
      <Card.Content class="grid justify-items-start gap-4">
        <p>{page.error?.message ?? "ページを読み込めませんでした。"}</p>
        <Button type="button" aria-disabled={retrying} onclick={retry}>
          再読み込み
        </Button>
      </Card.Content>
    </Card.Root>
  </section>
</main>
