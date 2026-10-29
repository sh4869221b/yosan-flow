<script lang="ts">
  import { tick } from "svelte";
  import { CalendarDays, CalendarPlus } from "@lucide/svelte";
  import { createDashboardPageController } from "#lib/dashboard/page-controller.svelte.ts";
  import BudgetSummary from "#lib/components/BudgetSummary.svelte";
  import { Button } from "#lib/components/ui/button/index.ts";
  import * as Card from "#lib/components/ui/card/index.ts";
  import PeriodCalendar from "#lib/components/PeriodCalendar.svelte";
  import CreatePeriodPanel from "./CreatePeriodPanel.svelte";
  import DashboardPeriodHeader from "./DashboardPeriodHeader.svelte";
  import PeriodSettingsPanel from "./PeriodSettingsPanel.svelte";
  import ResponsiveActionPanel from "./ResponsiveActionPanel.svelte";
  import type { DaySaveSuccess } from "#lib/dashboard/controller-types.ts";

  type Controller = ReturnType<typeof createDashboardPageController>;

  type Props = {
    controller: Controller;
    today: string;
    daySaveSuccess?: DaySaveSuccess | null;
    onDayEntryRequested?: (_payload: {
      readonly date: string;
      readonly periodId: string;
      readonly element: HTMLElement | null;
    }) => void;
  };

  let {
    controller,
    today,
    daySaveSuccess = null,
    onDayEntryRequested = () => {},
  }: Props = $props();
  let focusIntent = $state<"selection" | "retry" | null>(null);
  let requestedPeriodId = $state<string | null>(null);
  let additionalCreatePanel: ResponsiveActionPanel | undefined = $state();
  let additionalCreateOpen = $state(false);
  let focusCreatedPeriodOnClose = false;
  let initialCreateActive = $state(false);
  let createFocusIntent = $state<"initial" | "additional" | null>(null);
  let createSourceElement: HTMLElement | null = null;

  function submitCreate(surface: "initial" | "additional"): void {
    createFocusIntent = surface;
    createSourceElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (surface === "initial") initialCreateActive = true;
    controller.createInitialPeriod();
  }

  function retryCreate(surface: "initial" | "additional"): void {
    createFocusIntent = surface;
    controller.refreshCreatedPeriod();
  }

  function closeAdditionalCreate(): void {
    createFocusIntent = null;
    if (additionalCreatePanel) {
      additionalCreateOpen = false;
      if (!additionalCreatePanel.isMobile())
        additionalCreatePanel.focusTrigger();
    } else {
      document.getElementById("period-settings-heading")?.focus();
    }
  }

  function focusTarget(selector: string): void {
    void tick().then(() =>
      document.querySelector<HTMLElement>(selector)?.focus(),
    );
  }

  function restoreSelectedPeriod(): void {
    const select = document.querySelector('[data-testid="period-select"]');
    if (select instanceof HTMLSelectElement && controller.selectedPeriodId) {
      select.value = controller.selectedPeriodId;
    }
  }

  function selectPeriod(payload: { readonly periodId: string }): void {
    createFocusIntent = null;
    requestedPeriodId = payload.periodId;
    focusIntent = "selection";
    controller.handleSelectPeriod(payload);
  }

  function retrySummary(): void {
    const periodId =
      requestedPeriodId ??
      controller.selectedPeriodId ??
      controller.periods[0]?.id;
    if (!periodId) return;
    requestedPeriodId = periodId;
    focusIntent = "retry";
    controller.handleSelectPeriod({ periodId });
  }

  function requestCalendarDayEntry(payload: { readonly date: string }): void {
    const summary = controller.summary;
    if (
      controller.summaryLoading ||
      controller.periodInteractionDisabled ||
      summary?.periodId !== controller.selectedPeriodId
    ) {
      return;
    }
    onDayEntryRequested({
      date: payload.date,
      periodId: summary.periodId,
      element: document.querySelector<HTMLElement>(
        `[data-testid="calendar-day-${payload.date}"]`,
      ),
    });
    controller.openDayEntry(payload);
  }

  $effect(() => {
    if (!focusIntent || controller.summaryLoading) return;

    if (controller.summaryError) {
      if (focusIntent === "selection") restoreSelectedPeriod();
      focusTarget(
        focusIntent === "retry"
          ? "#page-error-heading"
          : '[data-testid="period-select"]',
      );
      focusIntent = null;
      return;
    }

    if (
      requestedPeriodId &&
      controller.summary?.periodId === requestedPeriodId
    ) {
      focusTarget("#selected-period-heading");
      focusIntent = null;
    }
  });

  function restoreCreatedFocus(
    surface: "initial" | "additional",
    periodId: string | null,
    succeeded: boolean,
    pending: boolean,
    error: string | null,
  ): void {
    if (
      succeeded &&
      !controller.createdRefreshPending &&
      controller.createdPeriodId === periodId &&
      controller.selectedPeriodId === periodId &&
      controller.summary?.periodId === periodId
    ) {
      if (surface === "additional" && additionalCreatePanel?.isMobile()) {
        focusCreatedPeriodOnClose = true;
        additionalCreateOpen = false;
      } else {
        document.getElementById("selected-period-heading")?.focus();
      }
    } else if (
      pending &&
      error &&
      controller.createdRefreshPending &&
      controller.createdPeriodId === periodId
    ) {
      document
        .getElementById(
          surface === "initial"
            ? "initial-period-created-heading"
            : "create-period-created-heading",
        )
        ?.focus();
    } else if (
      !pending &&
      error &&
      document.activeElement === document.body &&
      createSourceElement?.isConnected
    ) {
      createSourceElement.focus();
    }
  }

  $effect(() => {
    const surface = createFocusIntent;
    if (!surface || controller.createSaving || controller.createdRefreshing)
      return;
    const periodId = controller.createdPeriodId;
    const pending = controller.createdRefreshPending;
    const error = controller.createError;
    const succeeded =
      !pending &&
      !error &&
      periodId != null &&
      controller.selectedPeriodId === periodId &&
      controller.summary?.periodId === periodId;
    if (!pending) initialCreateActive = false;

    void tick().then(() => {
      if (
        createFocusIntent !== surface ||
        controller.createSaving ||
        controller.createdRefreshing
      )
        return;
      if (surface === "additional" && !additionalCreateOpen) {
        createFocusIntent = null;
        return;
      }
      restoreCreatedFocus(surface, periodId, succeeded, pending, error);
      createFocusIntent = null;
    });
  });
</script>

{#snippet primaryWorkspace(summary: NonNullable<Controller["summary"]>)}
  <section aria-label="日別入力">
    <Card.Root class="gap-4">
      <Card.Header>
        <div class="flex items-center gap-4 max-[760px]:items-start">
          <span
            class="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-icon-foreground"
            aria-hidden="true"
          >
            <CalendarDays size={25} strokeWidth={2.4} />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-extrabold text-primary uppercase">Step 1</p>
            <h2
              class="text-[clamp(1.25rem,2vw,1.55rem)] leading-tight font-bold max-[760px]:text-base"
            >
              カレンダーの日付を選んで入力
            </h2>
            <p class="mt-1.5 text-muted-foreground max-[760px]:hidden">
              日付を押すと、その日の入力と履歴をまとめて確認できます。
            </p>
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        <section aria-labelledby="period-calendar-heading">
          <h2 id="period-calendar-heading" class="sr-only" tabindex="-1">
            カレンダー
          </h2>
          {#key summary.periodId}
            <PeriodCalendar
              rows={summary.dailyRows}
              startDate={summary.startDate}
              endDate={summary.endDate}
              {today}
              disabled={controller.summaryLoading ||
                controller.periodInteractionDisabled ||
                summary.periodId !== controller.selectedPeriodId}
              disabledReason={controller.summaryLoading
                ? "期間を読み込み中です"
                : "期間の操作が完了するまで入力できません"}
              requestEdit={requestCalendarDayEntry}
            />
            {#if daySaveSuccess?.periodId === controller.selectedPeriodId}
              <p data-testid="day-entry-save-status" role="status">
                {daySaveSuccess.date} の支出を保存しました。
              </p>
            {/if}
          {/key}
        </section>
      </Card.Content>
    </Card.Root>
  </section>
{/snippet}

<section class="workspace-shell">
  {#if initialCreateActive || (controller.periods.length === 0 && !controller.summaryLoading && !controller.summaryError)}
    <section
      data-testid="create-period-panel"
      aria-labelledby="empty-period-heading"
    >
      <Card.Root class="gap-4">
        <Card.Header class="gap-3">
          <span
            class="inline-flex size-11 items-center justify-center rounded-full bg-accent text-icon-foreground"
            aria-hidden="true"
          >
            <CalendarDays size={25} strokeWidth={2.4} />
          </span>
          <p class="text-xs font-extrabold text-primary uppercase">Step 1</p>
          <h1
            id="empty-period-heading"
            class="text-[clamp(1.25rem,2vw,1.55rem)] font-bold"
            tabindex="-1"
          >
            最初の予算期間を作成
          </h1>
          <p class="text-muted-foreground">
            まずは使う期間と総予算を決めます。作成後はカレンダーの日付を押して支出を入力できます。
          </p>
        </Card.Header>
        <Card.Content>
          <CreatePeriodPanel
            variant="empty-state"
            {controller}
            onSubmit={() => submitCreate("initial")}
            onRetry={() => retryCreate("initial")}
          />
        </Card.Content>
      </Card.Root>
    </section>
  {:else}
    <DashboardPeriodHeader
      summary={controller.summary}
      periods={controller.periods}
      selectedPeriodId={controller.selectedPeriodId}
      saving={controller.periodInteractionDisabled}
      interactionDisabled={controller.periodInteractionDisabled}
      loading={controller.summaryLoading}
      {selectPeriod}
    />

    {#if controller.summaryError || focusIntent === "retry"}
      <section
        aria-labelledby="page-error-heading"
        aria-busy={controller.summaryLoading}
      >
        <Card.Root class="gap-3">
          <Card.Header>
            <h2
              id="page-error-heading"
              class="text-[clamp(1.25rem,2vw,1.55rem)] font-bold"
              tabindex="-1"
            >
              読み込みに失敗しました
            </h2>
          </Card.Header>
          <Card.Content class="grid justify-items-start gap-3">
            {#if controller.summaryError}
              <p role="alert">{controller.summaryError}</p>
            {:else}
              <p role="status">読み込み中...</p>
            {/if}
            <Button type="button" onclick={retrySummary}>再読み込み</Button>
          </Card.Content>
        </Card.Root>
      </section>
    {/if}

    <BudgetSummary
      summary={controller.summary}
      loading={controller.summaryLoading}
    />

    {#if controller.summary}
      {@render primaryWorkspace(controller.summary)}
    {/if}

    <section class="grid content-start gap-3">
      <section aria-labelledby="period-settings-heading">
        <h2 id="period-settings-heading" class="sr-only" tabindex="-1">
          期間設定
        </h2>
        <PeriodSettingsPanel {controller} />
      </section>
      <ResponsiveActionPanel
        bind:this={additionalCreatePanel}
        bind:open={additionalCreateOpen}
        title="次の予算期間を作成する"
        description="今の期間が終わった後の期間を追加します。"
        testId="create-period-panel"
        sheetTestId="create-period-sheet"
        onClose={() => {
          if (createFocusIntent === "additional") createFocusIntent = null;
        }}
        onCloseAutoFocus={(event) => {
          if (focusCreatedPeriodOnClose) {
            event.preventDefault();
            focusCreatedPeriodOnClose = false;
            document.getElementById("selected-period-heading")?.focus();
          }
        }}
      >
        {#snippet icon()}
          <CalendarPlus size={20} strokeWidth={2.4} aria-hidden="true" />
        {/snippet}
        <CreatePeriodPanel
          variant="secondary-action"
          {controller}
          onSubmit={() => submitCreate("additional")}
          onRetry={() => retryCreate("additional")}
          onCancel={closeAdditionalCreate}
        />
      </ResponsiveActionPanel>
    </section>
  {/if}
</section>

<style>
  .workspace-shell {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1.45fr) minmax(20rem, 0.9fr);
  }

  .workspace-shell > :global(.summary-header),
  .workspace-shell > section[aria-labelledby="page-error-heading"],
  .workspace-shell
    > :global(section[aria-labelledby="budget-summary-heading"]) {
    grid-column: 1 / -1;
  }

  @media (max-width: 900px) {
    .workspace-shell {
      grid-template-columns: 1fr;
    }
  }
</style>
