<script lang="ts">
  import { Save, X } from "@lucide/svelte";
  import { tick, type Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { Label } from "#lib/components/ui/label/index.ts";
  import { Textarea } from "#lib/components/ui/textarea/index.ts";
  import { parseNonNegativeIntegerYenInput } from "#lib/dashboard/yen-input.ts";

  const AMOUNT_ERROR = "入力額は 0 以上の整数で入力してください。";

  type Props = {
    inputYen?: string;
    memo?: string;
    saving?: boolean;
    close?: () => void;
    save?: (_payload: { date: string; inputYen: number; memo: string }) => void;
    date?: string | null;
    preview?: Snippet;
    saveError?: string | null;
  };

  let {
    inputYen = $bindable(""),
    memo = $bindable(""),
    saving = false,
    close = () => {},
    save = () => {},
    date = null,
    preview,
    saveError = null,
  }: Props = $props();

  let inputError = $state<string | null>(null);
  let amountInput = $state<HTMLInputElement | null>(null);
  let formHeading: HTMLHeadingElement;
  let saveErrorElement = $state<HTMLParagraphElement>();
  let submitFocusTarget: HTMLElement | null = null;

  $effect(() => {
    if (saveError == null) {
      return;
    }
    void tick().then(() => {
      saveErrorElement?.scrollIntoView({ block: "nearest" });
      if (submitFocusTarget?.isConnected) {
        if (document.activeElement === document.body) {
          submitFocusTarget.focus();
        }
        return;
      }
      formHeading?.focus();
    });
  });

  function handleAmountInput(event: Event): void {
    if (inputError == null) {
      return;
    }
    const value = (event.currentTarget as HTMLInputElement).value;
    inputError =
      parseNonNegativeIntegerYenInput(value) == null ? AMOUNT_ERROR : null;
  }

  function handleClose(): void {
    if (!saving) {
      close();
    }
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!date || saving) {
      return;
    }
    const parsed = parseNonNegativeIntegerYenInput(inputYen);
    if (parsed == null) {
      inputError = AMOUNT_ERROR;
      await tick();
      amountInput?.focus();
      amountInput?.scrollIntoView({ block: "nearest" });
      return;
    }
    inputError = null;
    submitFocusTarget =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    save({ date, inputYen: parsed, memo });
  }
</script>

<form class="entry-form" onsubmit={handleSubmit}>
  <h3 id="day-entry-form-heading" tabindex="-1" bind:this={formHeading}>
    入力内容
  </h3>
  <div class="field">
    <Label for="day-entry-amount">入力額 (円)</Label>
    <span class="money-input">
      <span aria-hidden="true">¥</span>
      <Input
        class="h-auto min-h-[3.15rem] rounded-none border-0 px-[0.85rem] py-0 text-[1.35rem] font-extrabold shadow-none focus-visible:outline-none focus-visible:ring-0 md:text-[1.35rem]"
        id="day-entry-amount"
        type="text"
        inputmode="numeric"
        bind:ref={amountInput}
        bind:value={inputYen}
        aria-invalid={inputError != null}
        aria-describedby={inputError ? "day-entry-amount-error" : undefined}
        oninput={handleAmountInput}
      />
    </span>
  </div>
  {#if inputError}
    <p id="day-entry-amount-error" class="error-message" role="alert">
      {inputError}
    </p>
  {/if}

  <div class="field">
    <Label for="day-entry-memo">メモ</Label>
    <Textarea
      class="min-h-[5.2rem]"
      id="day-entry-memo"
      rows={3}
      bind:value={memo}
      placeholder="例: ランチ、食材の買い物など"
    />
  </div>

  {#if preview}
    {@render preview()}
  {/if}

  <div class="actions">
    <Button
      variant="outline"
      class="h-auto min-h-12"
      type="button"
      onclick={handleClose}
      disabled={saving}
    >
      <X size={18} strokeWidth={2.4} aria-hidden="true" />
      閉じる
    </Button>
    <Button class="h-auto min-h-12" type="submit" disabled={saving}>
      <Save size={18} strokeWidth={2.4} aria-hidden="true" />
      {saving ? "保存中..." : "保存する"}
    </Button>
  </div>

  {#if saveError}
    <p
      id="day-entry-save-error"
      class="error-message"
      role="alert"
      bind:this={saveErrorElement}
    >
      {saveError}
    </p>
  {/if}
</form>

<style>
  .entry-form {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
  }

  h3 {
    color: var(--foreground);
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
  }

  .field {
    display: grid;
    gap: 0.45rem;
    min-width: 0;
  }

  .money-input {
    border: 1px solid var(--input);
    border-radius: var(--radius-md);
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr);
    overflow: hidden;
  }

  .money-input > span {
    align-items: center;
    background: #fbf6ee;
    border-right: 1px solid var(--input);
    color: #5d4a3b;
    display: inline-flex;
    font-weight: 900;
    justify-content: center;
  }

  .money-input:focus-within {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  .error-message {
    background: var(--destructive-subtle);
    border: 1px solid var(--destructive-border);
    border-radius: var(--radius-lg);
    color: var(--destructive);
    font-weight: 800;
    margin: 0;
    padding: 0.75rem 0.85rem;
  }

  .actions {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  }

  @media (max-width: 760px) {
    .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
