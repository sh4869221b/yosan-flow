# Yosan Flow UI UX Contract

> Status: Proposed UX contract for Issue #329. This document records current implementation
> facts and the decision-complete contract for the proposed UI. Proposed UI behavior remains
> unimplemented until the downstream Issues deliver it.

## 1. 目的・現行との差分

### 1.1 目的

Issue #329 の目的は、Issue #239 の再設計を後続 leaf Issue が実装できる decision-complete な UX 契約にすることである。対象は user flow、情報構造、component の公開契約、state ownership、feedback、focus/keyboard、responsive、既存 semantics、selector migration、依存関係である。今回の設計作業は製品コード、CSS、API、server/domain、DB、依存関係、テスト実装を変更しない。

### 1.2 現在の実装事実と提案する差分

| 項目                    | 現在の実装事実（source）                                                                                                                                                                                                                                                                                                   | Issue #329 の提案・契約（未実装）                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| page の分岐             | `+page.svelte` は periods と summary があれば `DashboardWorkspace`、それ以外は `CreatePeriodPanel variant="empty-state"` を描画する（`src/routes/+page.svelte:12-17`）。                                                                                                                                                   | shell、empty state、primary/secondary action の境界を §3 と §11 で固定する。                                                                                                                                                     |
| summary と予算変更      | `DashboardWorkspace` は `BudgetSummary` に summary、periods、saving、error、save/select action を渡し、Calendar と settings/create を続けて配置する（`src/lib/components/dashboard/DashboardWorkspace.svelte:18-64`）。                                                                                                    | `BudgetSummary` は read-only、budget mutation は settings region に分離する。                                                                                                                                                    |
| 日次入力 surface        | `DayEntryModal.svelte` の実体は `<section>` と `aria-label`、`data-testid="day-entry-modal"` を持つ inline card であり、現時点で dialog role、modal background、focus trap の契約とはみなさない（`src/lib/components/DayEntryModal.svelte:75-124`）。                                                                      | desktop は dialog、mobile は同じ modal semantics の縦長 sheet とする提案を §6 に確定する。これは現行確認ではなく後続 #350 の実装対象である。                                                                                     |
| range picker            | `PeriodRangePicker` は内部 `range` state、heading、Calendar/manual input、saving と `-apply` button を持ち、有効時だけ `change` を通知する（`src/lib/components/PeriodRangePicker.svelte:12-98`）。                                                                                                                        | parent が draft を唯一所有する form-neutral controlled primitive へ移行する提案を §7 に定義する。                                                                                                                                |
| period controller state | `period-controller-state.svelte.ts` は summary、summary loading/error、共有 `periodSaving`/`periodError`、range draft、create draft を同一 controller で保持する（`src/lib/dashboard/period-controller-state.svelte.ts:30-46`）。create effect も同じ saving/error setter を使う（同:152-166）。                           | budget/range/create の operation state、dirty、reset、feedback を surface 単位で分離する契約を §5 と §11 に割り当てる。                                                                                                          |
| full-period update      | 現行の budget 保存は `getRangeEndDate()`/`getRangeStartDate()` から得た range state と budget payload、range 保存は summary の budget と入力された range payload を組み立てて既存 update effect に渡す（`src/lib/dashboard/period-controller-actions.svelte.ts:36-62`）。現行コードを committed range の保証とは扱わない。 | 新契約では budget 保存は committed range + confirmed budget draft、range 保存は committed budget + confirmed range draft で full-period PUT を組み立て、別 surface の未確定 draft を混入させない。API/DTO semantics は維持する。 |
| Calendar day            | `PeriodCalendarMonth` は period 内の日付を button として描画し、`calendar-day-<date>` と `used-<date>` を維持する（`src/lib/components/calendar/PeriodCalendarMonth.svelte:13-55`）。today/spent は既存 row の label/usedYen から表現される。                                                                              | day-state、actionability、selected/focus、keyboard navigation と accessible label を §8 に確定する。                                                                                                                             |
| linked confirmation     | #237 は closed、PR #245 は merged であり、proposal/confirm、no-write cancel、stale/conflict、atomic linked update の既存契約が根拠として存在する。                                                                                                                                                                         | range operation の `proposal-pending` と confirmation handoff を §5、§6、§11 に整理する。                                                                                                                                        |
| 実装状態                | 上記の差分は現行製品には未実装である。                                                                                                                                                                                                                                                                                     | 後続 Issue はこの文書で決めた境界を実装する。§13 の verification は文書/既存 source と各 leaf の QA を対応づける。                                                                                                               |

### 1.3 根拠

根拠は [Issue #329](https://github.com/sh4869221b/yosan-flow/issues/329)、[Issue #239](https://github.com/sh4869221b/yosan-flow/issues/239)、[Issue #330](https://github.com/sh4869221b/yosan-flow/issues/330)、[Issue #331](https://github.com/sh4869221b/yosan-flow/issues/331)、[Issue #332](https://github.com/sh4869221b/yosan-flow/issues/332)、[Issue #333](https://github.com/sh4869221b/yosan-flow/issues/333)、[Issue #334](https://github.com/sh4869221b/yosan-flow/issues/334)、[Issue #344](https://github.com/sh4869221b/yosan-flow/issues/344)、[Issue #345](https://github.com/sh4869221b/yosan-flow/issues/345)、[Issue #346](https://github.com/sh4869221b/yosan-flow/issues/346)、[Issue #347](https://github.com/sh4869221b/yosan-flow/issues/347)、[Issue #350](https://github.com/sh4869221b/yosan-flow/issues/350)、[Issue #351](https://github.com/sh4869221b/yosan-flow/issues/351)、[Issue #360](https://github.com/sh4869221b/yosan-flow/issues/360)、[Issue #363](https://github.com/sh4869221b/yosan-flow/issues/363)、[Issue #378](https://github.com/sh4869221b/yosan-flow/issues/378)、[Issue #237](https://github.com/sh4869221b/yosan-flow/issues/237)、[PR #245](https://github.com/sh4869221b/yosan-flow/pull/245) である。

## 2. 主要 user flow

Issue #329 の 9 flow は、すべて開始、入力、submit/action、成功、cancel、失敗からの復帰を同じ契約で辿る。page 上の form の scroll owner は page、Day Entry と History は dialog 内容、linked confirmation はその dialog 内容である。見出しはすべて programmatic focus 可能にする。

|   # | flow                                                    | 開始 / 入力 / submit                                                                                | 成功                                                                                                                                      | cancel                                                                                                             | 失敗からの復帰、focus、scroll owner                                                                                                                                                                                                 | desktop / mobile                                                                                                         |
| --: | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
|   1 | 初回の予算期間作成                                      | empty-state の primary create。範囲 → 予算 → 期間 ID の順に入力し、作成を submit                    | 新しい period を選択し、新期間 heading へ focus                                                                                           | 初期値へ reset し、開始日へ focus                                                                                  | field error は最初の invalid field、action/server error は create action 近く。page 内で error を nearest 表示。POST 成功後 GET 失敗は作成済み ID を含む status heading に focusし、次の Tab を GET 再読込へ置く。retry は GET のみ | page が主 scroll owner。900px 以下は 1 列、上は同じ DOM 順の shell                                                       |
|   2 | 現在の予算状況を確認する                                | selected period の shell を開き、period heading/selector と read-only summary を読む。submit はない | 明示的 page retry 成功時だけ selected period heading（空なら empty heading）へ focus。通常表示と background refresh は focus を動かさない | なし（読むだけ）                                                                                                   | 初回 load 失敗は自動 focus 移動なし。明示 retry 中は retry button を保持し、失敗時は shell error heading に戻す。page が scroll owner                                                                                               | summary を先に表示し、Calendar と settings を後に置く。responsive でも DOM 順を変えない                                  |
|   3 | period を切り替える / 過去期間を確認する                | period selector で period ID を選択して既存 select action を実行                                    | 新期間 heading へ focusし summary/calendar を表示                                                                                         | 通常の選択には cancel はなく、失敗時は現在の選択を維持                                                             | selector に focus を保ち shell alert を action 直近に表示。request race/stale 結果は controller が棄却。background refresh は focus を奪わない。page が scroll owner                                                                | selector は同じ DOM 位置に維持し、900px 以下は 1 列                                                                      |
|   4 | 日付を選択して支出を入力する                            | Calendar の date button から開く。対象日 heading → 金額/メモ → preview → 保存/閉じるの順に操作      | 保存が採用された同じ modal session のみ close。open 元の日付へ focusを戻し、Calendar 付近に polite 「保存しました」を残す                 | 保存前の閉じる/Escape は draft を破棄し write しない                                                               | validation は最初の invalid inputへ focusしその error と共に nearest 表示。server error は値を保持し action 近くに表示、focus は保持。保存中は close/Escape/re-submit を抑止                                                        | 760px より広い幅は中央 dialog、760px 以下は縦長 sheet。両方 role=dialog、dialog 内容だけが scroll owner                  |
|   5 | 日次履歴を確認・編集・削除する                          | Day Entry と同じ固定 History region。edit は 1 行、delete は行内確認を開く                          | edit/cancel は同じ行の編集 button。delete 成功は次行 → 前行 → History heading の順に focus                                                | edit cancel は同じ行の編集 button。delete cancel は同じ行の削除 button。Escape は行内確認を先に閉じ、次で親 dialog | 初回 load failure は dialog focus を奪わず region alert/retry。row failure は該当 row 近くで draft を保持。retry 成功は History heading、失敗は共通規則。dialog 内容が唯一の scroll owner                                           | desktop/mobile とも同じ region/DOM 順。History に独立 scroll や別 DOM を作らない                                         |
|   6 | 追加期間を作成する                                      | settings の additional create action。範囲 → 予算 → 期間 ID → 作成                                  | 新 period を選択し新期間 headingへ focus                                                                                                  | form を閉じ、開いた create button へ focus。初回作成の reset は開始日へ focus                                      | POST failure は form/action error。POST 成功後 GET failure は作成済み ID と GET-only retry を表示し、POST を再送しない。page が scroll owner                                                                                        | 900px 以下は page 1 列、上は Calendar/settings 2 列を許可。DOM 順は同じ                                                  |
|   7 | 期間予算を変更する                                      | settings の独立 budget form で current 値を draft に編集して保存                                    | budget form heading へ focusし committed 値へ reset                                                                                       | committed budget へ戻し form の先頭 field へ focus                                                                 | invalid は最初の invalid field、server failure は action 近くで現在 focus を保持。別 range/create message を消さない。page が scroll owner                                                                                          | budget と range は別 heading/form/action region。responsive でも DOM 順と owner を維持                                   |
|   8 | 期間範囲を変更する                                      | settings の独立 range form で draft を編集し、validation 後に保存                                   | ordinary success は range form headingへ focus。linked 影響時は proposal-pending へ handoff                                               | committed range へ戻し range の開始日へ focus                                                                      | invalid は最初の invalid field。ordinary server failure は range action 近くで focus 保持。proposal stale は旧 proposal を破棄し、最新取得後に開始日へ戻して再編集を説明。dialog 内容（confirmation 中）または page が owner        | range primitive は同じ DOM/keyboard 契約。proposal が開いた時だけ confirmation dialog が modal                           |
|   9 | linked-period proposal を確認して確定または cancel する | proposal-pending confirmation を開き、target/successor の before/after を読む                       | confirm は atomic update 後に dialog を閉じ、range form heading へ focusして resync                                                       | 初期 focus は cancel。cancel/Escape は no-write で proposal を破棄し range 開始日へ戻す                            | stale/conflict は旧 proposal を適用せず確認 dialog を閉じる。最新取得成功後は range 開始日、取得失敗時は range 内 error headingと GET 再取得へ focus。confirmation 内容が scroll owner                                              | desktop/mobile とも alertdialog/dialog semantics、背景操作不可、Tab loop。confirm 中は cancel/Escape/二重 confirm を抑止 |

すべての flow で loading、empty、load-error は排他的に表示し、loading を empty と誤認させない。成功 status は同じ region の polite live region、server error は対象 action 直近の alert とし、別 surface の変更で誤って消去しない。

### 2.1 QA trace examples

- desktop: Calendar で `2026-09-05` を選択 → `1200円` と memo を入力 → 保存。採用された同一 session だけが dialog を閉じ、元の日付 button へ focus を戻し、Calendar 付近の polite status を表示する。
- mobile: 同じ入力を縦長 sheet で行う。DOM 順、validation、保存中 lock、保存後の focus/status は desktop と同じで、sheet の内容領域だけが scroll owner になる。
- History row 2: row 2 の edit を開始すると金額 input に focusし、cancel で row 2 の edit button に戻る。existing の表示順と追加/調整情報は同じ History region に保持する。
- failure traces: 空金額 submit は request を送らず最初の invalid fieldへ focus、最後の History row delete failure は row 近くに error を表示し draft と復帰先を保持、dialog 中の period selector 操作は通常導線にせず、day save 中 Escape は close/re-submit を抑止する（既存 in-flight write は cancel しない）。

## 3. 情報構造と responsive

### 3.1 App shell と情報順

page の DOM 順は、ページ heading → 選択期間と period selector → read-only summary → 期間 Calendar → 期間設定と追加作成で固定する。summary は今日使える額、今日の使用額、今日の残額を先に示し、期間残額、残日数、超過を補足情報として示す。summary から budget mutation を分離し、budget は settings の独立 region に置く。

period が空の場合は empty-state の heading と説明を最初に置き、最初の期間作成を primary action とする。period ID の編集・指定機能は削除せず、create form 内で範囲と予算に続く field として残す。追加作成は settings の secondary action から同じ form body を開く。#330 は shell、summary、empty wrapper/slot を持ち、#344 は slot 内 form body を持つ。

### 3.2 Responsive と scroll

- page 本体を主 scroll owner とし、900px 以下は 1 列、900px 超は Calendar と settings の 2 列を許可する。DOM 順、heading、primary action の意味は breakpoint で変えない。
- Day Entry は両幅で `role="dialog"` と modal background suppression、Tab loop を持つ。760px 超は中央 dialog、760px 以下は縦長 sheet とする。同じ内容・同じ DOM 順（対象日 heading → 入力額/メモ → preview → 保存/閉じる → 固定 History region）を保つ。
- dialog の内容領域を唯一の scroll owner とし、History に独立 scroll、別 DOM、固定 footer は作らない。header の対象日と閉じる操作は長い memo/history でも見つけやすくする。
- 320px 幅、375/768/1280px、長い memo、複数月、empty、loading、error の各状態で page の横 overflow を発生させない。mobile は page scroll と dialog content scroll の境界を保ち、desktop は中央 dialog の内容だけを scroll する。
- page form（budget/range/create）の scroll owner は page、linked confirmation の scroll owner はその dialog 内容である。error/focus 移動は所属 owner 内で nearest に表示する。

この節は提案契約であり、現行の inline Day Entry や現行 CSS の挙動を実装済みとは扱わない。根拠は `src/routes/+page.svelte:12-17` と `src/lib/components/dashboard/DashboardWorkspace.svelte:18-64`、後続 owner は #330/#344/#345/#346/#350 である。

## 4. component public contract

各 public surface は owner、owned/non-owned state、props、callbacks、composition point、
controlled/uncontrolled、allowed/no-touch path、handoff を次の契約で持つ。表の #NN は
実装 work package の担当であり、runtime の authoritative state owner とは別である。runtime
の draft/touched/validation は §5/§7 に記した page/controller/parent が所有し、component
実装担当へ移さない。ここでの型は実装用の文書上の shape であり、本書では製品に型
ファイルを追加しない。

| component / surface              | owner と owned state                                                                                                                                                                                                                                   | props / callbacks                                                                                       | composition / controlled                                                                                      | allowed / no-touch path                                                                                                                                               | downstream                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| App shell / `DashboardWorkspace` | #330 が page heading、selected period、page loading/error、shell region、selector action を所有                                                                                                                                                        | `controller` から既存 summary/periods と select action を受ける                                         | page が Summary/Calendar/settings/create を順に compose                                                       | allowed: `src/routes/+page.svelte`, `src/lib/components/dashboard/DashboardWorkspace.svelte`。no-touch: API/DTO、domain、Day Entry/History 内部                       | #330 → #331/#344/#345/#350 |
| read-only `BudgetSummary`        | #330 が display state のみを所有。budget draft/saving/error/save callback は non-owned                                                                                                                                                                 | `summary: PeriodSummary \| null`, `loading: boolean` の read-only props                                 | period selector は shell が既存 `selectPeriod` action へ接続し、Summary は selector state/action を所有しない | allowed: summary leaf と表示 adapter。no-touch: budget form、save/cancel、mutation feedback                                                                           | #330 → #345                |
| Calendar                         | #331 が day presentation、selection、keyboard focus を所有                                                                                                                                                                                             | existing `summary.dailyRows`、start/end、loading、open date callback                                    | shell が Calendar を compose。日付 action は #350 の Day Entry open へ渡す                                    | allowed: `src/lib/components/PeriodCalendar.svelte`, `calendar/**`。no-touch: Day Entry shell、period DTO/domain                                                      | #331 → #350                |
| Day Entry shell                  | #350 が modality、open origin、modal generation/session、input/memo/preview、day save outcome、global focus、固定 History region を所有                                                                                                                | 既存 `isOpen/date/inputYen/memo/saving/error/preview` と close/save callback、History composition point | shell は controlled controller state を受け、History を固定 region/slot に compose                            | allowed: `DayEntryModal.svelte`, `day-entry/DayEntryForm.svelte`, preview、最小 page adapter/controller。no-touch: History row 内部、API/queue/revision semantics     | #350 → #351                |
| fixed History region             | #350 が位置、DOM order、region heading/aria relationship、scroll contract を所有                                                                                                                                                                       | History data/loading/error/mutating と row content を slot/adapter で受ける                             | Day Entry と同じ dialog 内容に固定。独立 DOM/scroll を持たない                                                | allowed: shell の slot/aria wiring。no-touch: row mutation rules                                                                                                      | #350 → #351                |
| History internals                | #351 が load/empty/error、row edit/delete draft、row mutation feedback/local focus を所有                                                                                                                                                              | `histories`, `loading`, row mutation id、update/delete callbacks                                        | fixed region 内だけで controlled row state。global modality/focus は non-owned                                | allowed: `HistoryPanel.svelte`, `HistoryRow.svelte`。no-touch: Day Entry modality/DOM order/global restore                                                            | #351 → #334                |
| form-neutral `PeriodRangePicker` | #360 は primitive の実装を担当。runtime の raw draft/field touched/errors/validation は #344/#346 parent（§5/§7）が所有し、primitive は Calendar の表示月/local presentation だけを所有                                                                | §7 の `value`, `onValueChange`, `onFieldBlur`, IDs/errors/disabled/test prefix                          | controlled。heading、submit、save/cancel、server feedback、proposal は non-owned                              | allowed: range picker/input/calendar/pure helper。no-touch: create/update semantics、API、confirmation、authoritative draft/validation state                          | #360 → #344/#346           |
| budget settings region           | #345 は budget region の実装担当。budget form の DOM、focus、save/cancel focus は #345 UI が所有し、runtime の budget string draft、dirty、validation、action status は #363 adapter が所有する。region は controlled view/action surface として受ける | committed budget と operation-specific actions from #363                                                | form surface が controlled draft と full PUT adapter を compose                                               | allowed: `src/lib/components/dashboard/PeriodSettingsPanel.svelte` budget region。no-touch: range draft/confirmation/API semantics、authoritative draft state         | #345                       |
| range settings region            | #346 は range region の実装担当。runtime の range draft/validation/ordinary update/proposal-pending は #363 adapter/parent が所有し、primitive は §7 の controlled value を受ける                                                                      | §7 primitive と #363 range adapter、proposal callback                                                   | form surface が primitive を controlled に使用                                                                | allowed: `src/lib/components/dashboard/PeriodSettingsPanel.svelte` range region。no-touch: confirmation after proposal、authoritative draft state                     | #346 → #347                |
| linked confirmation              | #347 が proposal display、cancel/confirm、confirming、stale/conflict/resync focus を所有                                                                                                                                                               | server proposal の target/successor/before/after、confirm/cancel callbacks                              | existing AlertDialog protocol を再利用。proposal object は server response をそのまま使用                     | allowed: `src/lib/components/dashboard/PeriodBoundaryConfirmationDialog.svelte` と adapter。no-touch: range draft/primitive/ordinary save                             | #347 → #334                |
| create form                      | #344 は create form の実装担当。runtime の create ID/range/budget draft、validation、POST status、cancel/reset、GET-only retry state は create prerequisite が所有し、form は controlled body として受ける                                             | #360 primitive、typed create recovery fields (§5)、create actions                                       | empty shell (#330) の slot内 body。shell を再所有しない                                                       | allowed: `src/lib/components/dashboard/CreatePeriodPanel.svelte` と最小 adapter。no-touch: page shell、range primitive internals、authoritative draft/API idempotency | #344 → #334                |

### 4.1 Day-save outcome の公開契約

controller が `daySaveSuccess: { periodId: string; date: string } | null` を所有し、page
adapter 経由で shell に公開する。成功判定は既存 lifecycle の結果に加えて、同じ modal
generation、selected period、selection sequence に属する採用結果だけを close 直前に設定する。
失敗、cancel、旧 session、offscreen 結果からは設定しない。shell は selected period と一致する
値だけを Calendar 付近の polite status に表示する。

次の Day Entry open、edit、cancel、period change で clear し、成功による close では保持する。
modal の open → closed 遷移だけから成功を推測しない。#350 は
`day-entry-mutation-lifecycle.ts`、`day-entry-controller-state.svelte.ts` と必要最小限の
controller 型/page adapter を変更できるが、queue、revision、close 判定は維持する。

## 5. state ownership / transition

### 5.1 State owners

| state                    | authoritative owner                                                                         | meaning and allowed publication                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| committed summary/period | existing period controller                                                                  | selected period の authoritative summary。period ID、summary revision、completeness、freshness を保ち、hidden/stale result は publish しない |
| budget draft             | #363 adapter が authoritative owner、#345 form は controlled renderer                       | string draft。dirty、validationError、serverError、saving、success は range と独立                                                           |
| range draft              | #363 adapter/#344/#346 parent が authoritative owner、#360 primitive は controlled renderer | `{startDate: string; endDate: string}` の raw draft。partial/invalid/reversed も保持し、暦として有効な値だけ Calendar に投影                 |
| create draft             | create prerequisite が authoritative owner、#344 form は controlled renderer                | id/start/end/budget の string draft。手編集した ID は維持し、未編集 ID だけ range 由来 default を更新                                        |
| day session              | #350 controller/lifecycle                                                                   | periodId、date、modal generation、selection sequence、input/memo、saving/error、採用結果の freshness を所有                                  |
| daySaveSuccess           | #350 controller                                                                             | `{ periodId: string; date: string } \| null`。同じ generation/period/sequence の採用 success だけを close 直前に設定                         |
| History row state        | #351                                                                                        | load/empty/error、edit draft、delete confirmation、該当 row mutation と local focus。global dialog lifecycle は所有しない                    |
| proposal                 | #346 が pending を発生、#347 が受領後を所有                                                 | server response の target/successor/before/after、request sequence、両 period revisions を保持。client で再計算しない                        |
| feedback                 | 各 surface                                                                                  | field/server/success/loading/empty の message を他 surface と共有しない。background refresh で focus/message を消さない                      |

現行の `periodSaving`/`periodError`、range/create draft は `period-controller-state.svelte.ts:30-46`
および同 create effect の setter（同:152-166）で共有されている。以下は新契約での分離であり、
現行がすでに実装済みとは扱わない。

### 5.2 State transitions

| surface             | transition                                                                                                 | feedback/focus owner     | retry/cancel                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| page load/selection | loading → summary/empty または load-error                                                                  | shell/page               | explicit GET retry。background refresh は focus を動かさない                         |
| budget              | default → editing/dirty → invalid または submitting → success/server-error                                 | #345 budget region       | invalid は request なし。cancel は committed budget、server error は再 submit/cancel |
| range               | idle → editing/dirty → invalid または submitting → ordinary-success/ordinary-error/proposal-pending        | #346 range region        | invalid は request なし。cancel は committed range。proposal は #347 へ              |
| linked              | proposal-pending → cancel/no-write または confirming → confirmed/resync / stale-conflict → recover/re-edit | #347 confirmation        | cancel/Escape は write なし。stale は旧 proposal を破棄し再取得                      |
| create              | default → editing/dirty → invalid または saving → created/refresh-pending/server-error                     | #344/create prerequisite | POST failure と POST+GET failure を分離。後者は GET-only retry                       |
| day save            | open → editing → saving → adopted success/close または error                                               | #350 shell + lifecycle   | saving 中は close/re-submit を抑止。既存 in-flight write は Escape で cancel しない  |
| history             | load → loaded/empty/load-error、row editing → row saving/error                                             | #351 fixed region        | row local retry/edit/delete cancel。該当 row の操作だけ interlock                    |

### 5.3 Full-period PUT の不変条件と具体例

API URL、request/response DTO、full-period PUT semantics は変えない。budget 保存は
committed range と validated budget draft、range 保存は committed budget と validated range draft
を payload に組み立てる。相手 surface の未確定 draft は送らない。

| state       | committed                         | dirty draft                             | 送信 payload                      |
| ----------- | --------------------------------- | --------------------------------------- | --------------------------------- |
| budget save | budget=120000、range=09-01..09-30 | budget=130000、range draft=09-02..09-29 | budget=130000、range=09-01..09-30 |
| range save  | budget=120000、range=09-01..09-30 | budget draft=130000、range=09-02..09-29 | budget=120000、range=09-02..09-29 |

これは full-period PUT の組み立て例であり、client に数字の再計算を移さない。既存
`PeriodSummaryRevision`、period ごとの mutation ordering、stale result rejection、summary
reconciliation、同日 add の並行許可、history/period mutation の直列化を維持する。

### 5.4 Reset / cancel matrix

Create reset rule: period selector changes do not overwrite the independent create draft. The
initial-create cancel stays on the visible empty shell, resets initial fields, and focuses the
start date; additional-create cancel closes the form and returns focus to its opened button. POST
failure keeps the edited draft, and POST success keeps `createdPeriodId`/refresh state until the
new period refresh completes. This rule is the create row's reset behavior; it is not delegated
back to the primitive or inferred from the selected period.

| event                         | budget draft/message                                                                                | range draft/message                    | create draft/message                                                                | day/history                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| period change                 | 新 committed 値へ reset                                                                             | 新 committed range へ reset            | 上記 create reset rule に従い draft を保持し、hidden period の結果を publish しない | 既存 session を閉じ stale result を reject |
| explicit budget cancel        | committed budget へ戻す                                                                             | 保持                                   | 保持                                                                                | 非干渉                                     |
| explicit range cancel         | 保持                                                                                                | committed range へ戻し proposal を破棄 | 保持                                                                                | 非干渉                                     |
| mutation success              | 当該 draft を committed 値へ reset、他 surface の dirty draft は保持                                | 同左                                   | created ID を保持し refresh 状態を分離                                              | day success のみ status を残し close       |
| spending-only summary refresh | dirty draft/message を消さない                                                                      | dirty draft/message を消さない         | create draft を消さない                                                             | session freshness を再評価                 |
| external same-setting change  | 未編集 draft は同期、dirty draft は保持し「最新の値が変更されました」を表示。保存前に戻す操作を要求 | 同じ                                   | ID 手編集を保持                                                                     | hidden/stale result を publish しない      |
| server validation failure     | draft を保持                                                                                        | raw draft を保持                       | field/action draft を保持                                                           | input/history draft を保持                 |
| proposal cancel               | 未送信 budget draft を保持                                                                          | latest committed range へ戻す          | 非干渉                                                                              | 非干渉                                     |

### 5.5 Operation interlock

operation-specific feedback の分離は、新しい queue/lock/retry framework を作ることではない。
既存 request lifecycle から queued/in-flight を導出する。

- create、budget、range の submit または linked confirmation 中は、他の period-management submit と period selector を disabled にする。
- proposal-pending 中は budget/range/create/selection を止め、confirm/cancel だけを有効にする。
- draft 編集と message 表示は surface 別に保つ。budget error を range/create に表示しない。
- day add と History mutation の既存 queue 互換性、プログラムからの concurrent add、shared revision/sequence を弱めない。
- history mutation 中は該当 row の操作再実行だけを抑止し、offscreen lifecycle を変える全操作 lock は作らない。

### 5.6 Create recovery の typed prerequisite

create state は専用 prerequisite で次の shape を公開する。#363 に create responsibility を混在させず、
#344 はこの state を form body として compose する。

`createSaving: boolean`
`createError: string | null`
`createdPeriodId: string | null`
`createdRefreshPending: boolean`
`refreshCreatedPeriod(): void`

POST failure は createError として扱い再 submit を許可する。POST が成功し GET refresh が失敗した場合は
createdPeriodId と createdRefreshPending を保持し、GET-only の `refreshCreatedPeriod()` を表示する。
retry 中は再読込 button に focusを置き、成功は新 period heading、失敗は created status heading に戻す。
POST を再送しない。遅延した create result は他 period/surface に表示せず、double-submit を抑止する。

create ID は手編集を保持し、未編集の ID だけ range 由来の既存 default を更新する。API/server に
idempotency 機構を追加しない。

## 6. feedback と focus / keyboard

### 6.1 Feedback と modality

field error は label/input の近くに stable ID で置き、input に `aria-invalid` と `aria-describedby` を付ける。submit failure は最初の invalid field へ focusし、その field と error を所属 scroll owner 内で nearest に表示する。server error は当該 action 直近の alert、success は同 region の polite status とする。日本語 message は問題と次の操作を示す。

client validation は金額・メモの全 input draft を、空の値や invalid raw amount を含めて保持する。invalid submit は request を作らず、金額/メモを reset しない。訂正後の入力は再検証し、valid になった場合だけ submit を許可する。

field error は編集/再検証で消し、server error は再 submit/cancel/period change で消す。success は同じ surface の次の edit/cancel/period change で消す。他 surface の変更や利用者操作のない background refresh では消さない。loading、empty、load-error は排他的に表示する。

Day Entry は desktop/mobile とも `role="dialog"`、modal background suppression、Tab loop を持つ。desktop は中央 dialog、mobile は縦長 sheet とする。backdrop click では閉じない。DOM 順は対象日 heading → 入力額/メモ → preview → 保存/閉じる → 固定 History region、dialog description に全履歴を一度に読ませない。初期 focus は `tabindex=-1` の対象日 heading、最初の Tab は金額 input へ進める。保存前の close/Escape は draft を破棄し write せず、保存中は close/Escape/re-submit を抑止し処理中であることを説明する。

### 6.2 共通 focus/scroll 規則

| 状態                    | focus                                                        | scroll owner と表示                             |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| validation failure      | 最初の invalid field                                         | field と error を所属 owner 内で nearest に表示 |
| ordinary server failure | 現在の focus を維持。focus 対象が消えた時だけ region heading | error を所属 owner 内で nearest に表示          |
| heading へ復帰          | すべての heading は programmatic focus 可                    | 対応する page または dialog 内容内で nearest    |
| page form               | 現在の input/action                                          | page                                            |
| Day Entry/History       | 現在の input/row action                                      | dialog 内容。History の独立 scroll は作らない   |
| linked confirmation     | cancel/confirm または error heading                          | confirmation dialog 内容                        |

以下は共通規則の明示例外であり、各復帰先は一意にする。

### 6.3 Settings/create の focus matrix

| 操作               | 成功                         | cancel/reset                                         | 失敗/再取得                                                                                                                                                                                      |
| ------------------ | ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| budget/range 保存  | 対応 form heading            | 対応 form の先頭 field。range は開始日               | ordinary server failure は現在 focus 維持、validation は最初の invalid field                                                                                                                     |
| 初回 create reset  | —                            | 開始日                                               | field/action error は create form 内                                                                                                                                                             |
| 追加 create cancel | —                            | 開いた button。button が消えた場合は期間設定 heading | page owner 内で error を nearest 表示                                                                                                                                                            |
| create success     | 新期間を選択し新期間 heading | —                                                    | POST 成功後 GET failure は作成済み ID を含む status heading、次の Tab は GET 再読込 button。retry 中は button に focus、成功は新期間 heading、失敗は status heading。POST 再 submit は案内しない |

budget と range は別 form/heading/action region とする。create の順序は範囲 → 予算 → 期間 ID → 作成で、日付編集で POST/PUT を自動送信しない。編集済み period ID を日付変更で上書きしない。

### 6.4 Day Entry/History の focus matrix

| 操作                      | 成功/閉じる                                                                                                                                 | cancel                                      | 失敗/再取得                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| day save                  | close、open 元の日付 button。消滅時は選択期間 Calendar heading、さらに消滅時は period selector/empty heading。Calendar 付近に polite status | close/Escape は draft を破棄し write しない | validation は最初の invalid field、server failure は draft と現在 focus を保持し action 近くに表示                                              |
| History edit              | 同じ行の edit button                                                                                                                        | 同じ行の edit button                        | 該当 row 近くに表示し draft を保持                                                                                                              |
| History delete cancel     | —                                                                                                                                           | 同じ行の delete button                      | —                                                                                                                                               |
| History delete success    | 次の行の edit → 前の行の edit → 最後なら History heading                                                                                    | —                                           | 該当 row 近く。行が消滅した場合も次→前→heading                                                                                                  |
| 初回 History load failure | focus を奪わない                                                                                                                            | —                                           | History 内 alert と retry。明示 retry 中は retry button を維持し、成功は History heading、失敗は共通規則。自動 load 成功では focus を動かさない |

edit は 1 行だけ、開始時は金額 input、delete 確認の初期 focus はキャンセルとする。行内 edit/delete 確認中の Escape はまずその確認を閉じ、次の Escape で親 dialog を閉じる。history mutation 中は該当操作の再実行だけを防ぎ、既存 offscreen lifecycle を変える全操作 lock は追加しない。

### 6.5 Linked confirmation と page load の focus matrix

| 操作                      | 成功                                                                   | cancel/Escape                                  | 失敗/再取得                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| linked proposal           | confirmation を開き初期 focus は cancel                                | range 開始日へ戻る。confirm request は送らない | —                                                                                                                                                            |
| confirm                   | dialog を閉じ range form heading へ focus                              | —                                              | confirming 中は cancel/Escape/重複 confirm を抑止                                                                                                            |
| stale/conflict            | 旧 proposal を破棄し最新取得成功後 range 開始日へ戻して re-edit を説明 | —                                              | 最新取得失敗は confirmation dialog を閉じ range 内 error heading。次の Tab は GET 再取得 button、成功は range 開始日、失敗は同 heading                       |
| page initial load failure | —                                                                      | 自動 focus 移動なし                            | shell が所有するのは period 一覧/選択 summary の load failure のみ。明示 retry 中は button 維持、成功は選択 period/empty heading、失敗は shell error heading |
| period select             | 新期間 heading                                                         | —                                              | selector に focus を保ち shell alert。mutation error を page に重複表示しない                                                                                |

通常利用では Day Entry を閉じてから背景の period selector を操作する。dialog 中に外部 period 変更が確定した場合だけ既存 controller の session 終了/stale rejection に従って閉じ、新期間 heading へ移す。force click や test-only production hook は契約に含めない。

### 6.6 Keyboard と根拠

Calendar の日付 navigation は §8 の roving tab stop を使い、Tab は Calendar を抜ける。range calendar は既存 Bits UI の keyboard behavior を利用し、独自 keyboard engine を作らない。

一次資料は [WAI-ARIA Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) と [WAI-ARIA Date Picker Dialog Example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/) である。現行 Day Entry は dialog semantics の実装ではないため、名称だけから focus trap/Escape を現行保証とは扱わない。後続 owner は #350/#351/#360/#346/#347、根拠 source は `src/lib/components/DayEntryModal.svelte:75-124`、`src/lib/components/day-entry/DayEntryForm.svelte:31`、`src/lib/components/HistoryPanel.svelte:42`、`src/lib/components/day-entry/HistoryRow.svelte:40`、`src/lib/dashboard/day-entry-mutation-lifecycle.ts:142`、`tests/e2e/dashboard-period-switch-modal.spec.ts:56` である。

## 7. shared range primitive

現行は primitive 内部 `range` state、heading、Calendar/manual input、saving と `-apply`
button を持つ（§1.2）。以下は #360 が実装する form-neutral controlled contract であり、
#344/#346 が composition owner となる。#360 は create/update/confirmation semantics を知らない。

### 7.1 Public props/callbacks

| prop/callback                                            | contract                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `value`                                                  | `{ startDate: string; endDate: string }`。parent が唯一所有し partial/invalid/raw draft も受け取る |
| `onValueChange(value): void`                             | Calendar/manual input のすべての変更を同じ callback で parent へ通知                               |
| `onFieldBlur(field: "start" \| "end"): void`             | manual input の blur を touched 判定用に parent へ通知                                             |
| `disabled: boolean`                                      | manual input と Calendar の双方を disabled。disabled reason は parent が説明                       |
| `startId: string`, `endId: string`                       | stable field ID。label と input association の根拠                                                 |
| `startError: string \| null`, `endError: string \| null` | 対応 field の error。DOM ID は field ID + `-error`                                                 |
| `rangeError: string \| null`                             | range-level error。DOM ID は `startId + "-range-error"`。両 input の described-by に関連付け       |
| `testIdPrefix: string`                                   | caller が既存 test ID を保持する prefix。primitive は caller-owned action ID を壊さない            |

primitive が所有しないものは page/section heading、create/update 説明、submit/save/apply、
cancel、saving/mutating text、server error、success、selected period、proposal/confirmation である。
各 input は label、help/error、`aria-invalid`、`aria-describedby` の association を維持する。
逆転 range では両 input を `aria-invalid` とし、range error を両方へ関連付ける。

### 7.2 Controlled raw draft と同期

manual text は `YYYY-MM-DD` の説明付き raw string として保持する。空、存在しない日、
途中入力を今日や直前の値へ勝手に置換しない。暦として有効な端点だけ Calendar へ投影する。
逆転 range は両端 draft を保持し rangeError を出すが、Calendar 上に確定した帯を表示しない。

Calendar で一日目を選ぶと start と空 end、二日目で range を確定する。単日 range は許可する。
Calendar 操作も onValueChange で通知する。表示月は Calendar UI の local state とし、draft の意味
や committed range と混同しない。parent の reset/cancel は両 input と Calendar へ同期する。

### 7.3 Validation/touched と focus order

focus order は manual start → manual end → Calendar の前/次月操作 → Calendar の単一 tab stop
→ parent の保存/cancel とする。parent は field 別 touched と submitAttempted を所有する。

- blur は onFieldBlur で通知し、その field の error は touched または submitAttempted 後に表示する。
- reversed error は両端が暦として有効で、どちらかが touched または submitAttempted 後に表示する。
- 表示済み error は入力ごとに再検証して解消する。未 touched の空 end は Calendar の一日目選択だけで error にしない。
- invalid submit は request を送らず submitAttempted を立て、最初の invalid field と error を nearest 表示する。
- cancel、success、period change、parent form reset は touched、submitAttempted、validation error を clear する。
- `2026-02-30` は raw start/end を保持して存在しない日付 error、`2026-09-` は partial raw draft を保持して field error、start=2026-09-30/end=2026-09-01 は両端を保持して rangeError とする。いずれも invalid submit では API request を作らない。

error message の例は、開始日「開始日は有効な日付を入力してください。」、終了日「終了日は有効な日付を入力してください。」、逆転 range「開始日は終了日以前にしてください。」とする。親 surface はこれらを field/range error prop として渡し、primitive は文言や server error の所有者にならない。

### 7.4 Disabled/responsibility boundary

disabled は manual input/Calendar の双方へ適用し、理由の表示、saving、server feedback、submit可否は親 surface が所有する。primitive 内部で saving/submitting semantics を推測しない。
既存 Bits UI の Calendar keyboard behavior が使える場合はそれを利用し、独自 keyboard engine を追加しない。

### 7.5 Caller handoff

- #344 は create draft を唯一の parent とし、submit/saving/server error/success/cancel を所有する。
- #346 は existing-period range draft を唯一の parent とし、ordinary save、proposal-pending、server feedback を所有する。
- #347 は proposal 受領後の cancel/no-write、confirming、confirmed/resync、stale/conflict を所有する。
- `src/routes/api/**`、`src/lib/server/**`、`migrations/**` と period validation/DTO semantics は全 caller/primitive から no-touch とする。

## 8. Calendar day-state

### 8.1 表示と actionability

日付は selected period の範囲内だけを actionable とする。future は予定支出の入力対象であり、future であることだけを理由に禁止しない。過去 period や closed status だけで現行にない readonly 制限を追加しない。loading、period switching、interaction disabled 中は既存制約と理由を accessible に説明する。

| day-state             | 表現する情報                                                                                            | 操作                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| today / past / future | 日付、状態名、金額/label                                                                                | period 内は Day Entry open。future も planned input を許可 |
| planned / spent       | `summary.dailyRows` の既存 label と `usedYen`、accessible label                                         | 金額と状態を同じ日付 action の説明に含める                 |
| selected              | 選択日であることを aria/current state と文言で示す                                                      | focus 日と混同しない                                       |
| focused               | keyboard focus indicator と日付/状態の読み上げ                                                          | roving tab stop の現在日                                   |
| disabled              | disabled 状態と理由を色以外の文言/accessible descriptionで示す。disabled reason は親 surface が所有する | disabled date は open しない                               |

today/past/future、planned/spent、selected、focus、disabled は色だけに依存せず、日付・金額・状態文言・accessible label で表す。金額は既存 `summary.dailyRows` を使用し client で再計算しない。

### 8.2 Keyboard

Calendar は日付の roving tab stop とする。初期 focus は選択日、選択日がなければ期間内の今日、今日もなければ先頭日。左右は ±1 日、上下は ±7 日、Home/End は週の端、PageUp/PageDown は前後月の同日（存在しなければ月末）へ移動する。期間外へ出る移動は期間端へ clamp する。Enter/Space は Day Entry を開き、Tab は Calendar を抜ける。keyboard focus 日と application selected 日を混同しない。

既存 selector `calendar-day-<date>` と `used-<date>`、row semantics は維持する。現行 day button の根拠は `src/lib/components/calendar/PeriodCalendarMonth.svelte:13-55` で、新 day-state/keyboard の実装 owner は #331、Day Entry への open/focus handoff は #350 である。

## 9. preserved behavior

次の業務/API/controller/domain/DB semantics は UI 再設計後も維持する。表の owner は UI 移行先または
既存保護を担当する実装 Issue とし、API/server/domain/DB の根拠は仕様変更せず no-touch とする。

| 保護する semantics                                                                                                                    | 実 source / test evidence                                                                                                                                                                                                                                | UI migration owner と境界                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| period-first ownership、`periodId`/`budget_period_id` scoping、cross-month period、period API URL/request/response、period validation | `tests/integration/api/periods-day-history.test.ts` の period path、`tests/e2e/dashboard.spec.ts` の current/future/range cases                                                                                                                          | #330/#331/#346 は表示・操作導線だけを移行。route、DTO、server、D1 は変更しない                                                             |
| full-period PUT、整数円・空値、budget/range の invalid request 防止、client での数字再計算禁止                                        | `tests/e2e/dashboard.spec.ts` の `rejects malformed period budget values before requests`、budget/range update、§5.3 の full PUT matrix                                                                                                                  | #345 は budget UI、#346 は range UI、#363 は controller adapter。committed 相手側を payload に使う契約を保つ                               |
| daily total、same-day spending と翌日の pace、future allowance                                                                        | `tests/e2e/dashboard.spec.ts` の `switches between current and future budget periods`、`tests/integration/api/periods-day-history.test.ts`                                                                                                               | #331/#350 は表示・入力、既存 summary/domain calculation は変更しない。future は allowance 0 の既存挙動を維持                               |
| history chronological replay/recalculation、最後の履歴削除時の daily total 除去                                                       | `tests/e2e/dashboard-day-entry-delete-recalculation.spec.ts`、`tests/integration/api/periods-day-history.test.ts` の last-row delete                                                                                                                     | #351 が History row 操作/表示を所有。API/service/recalculation は変更しない                                                                |
| shared `PeriodSummaryRevision`、mutation ordering、同日 add の並行許可、history/period の直列化                                       | `tests/unit/period-summary-mutation-queue.test.ts`、`tests/unit/cross-kind-summary-mutation-races.test.ts`、`tests/e2e/dashboard-cross-mutation-races.spec.ts`                                                                                           | #363 が period mutation sequencing、#350 が day session、#351 が history row mutation を保護。新しい queue/lock/retry framework は作らない |
| configuration/spending completeness、offscreen/stale/generation による結果棄却                                                        | `tests/e2e/dashboard-day-entry-summary-completeness.spec.ts`、`dashboard-day-entry-save-race.spec.ts`、`dashboard-day-entry-save-session-race.spec.ts`、`dashboard-history-mutation-races.spec.ts`、`tests/unit/dashboard-history-period-return.test.ts` | #350/#351/#363 が各 lifecycle を維持。offscreen、old generation、hidden period の結果を publish しない                                     |
| linked proposal の full-snapshot conflict 判定、D1 target/successor atomic update、repository/domain semantics                        | `tests/e2e/period-boundary-confirmation-success-scenarios.ts`、`period-boundary-confirmation-adversarial-scenarios.ts`、`tests/integration/api/period-boundary-persistence.test.ts`                                                                      | #346/#347 は proposal UI と handoff のみ。full snapshot、409 conflict、D1 atomic update、repository/domain は変更しない                    |

`tests/e2e/dashboard-day-entry-failure-handling.spec.ts` は scenario 単位で分ける。同じ file の
`shows save error and keeps input on failed period update` は #330 の移設後 #345 の予算 UI、
`shows save error and keeps input on failed day entry update` は #350、history load failure は #351 が
担当する。これを file 全体の一括 owner 変更や混在した error 表示の根拠にしない。

## 10. selector / test migration

既存 selector の目的を保ったまま owner の DOM へ移す。semantic role/label を優先し、test ID は
既存の安定した anchor が必要な箇所だけ維持する。移行時も test-only production hook、
`force: true`、背景を強制クリックして green にする操作は設計しない。

### 10.1 Selector anchor map

| selector / locator                                                                                  | 移行先 owner                      | 移行条件と保持する意味                                                                                                                           |
| --------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `period-select`, `period-id`                                                                        | #330 shell                        | selected period の選択・表示 anchor。Summary leaf に戻さず、通常 selection を close 後に到達可能にする                                           |
| `calendar-day-<date>`, `used-<date>`                                                                | #331 Calendar                     | date action と日次 used amount の同日説明を維持。#350 は open/focus handoff のみ担当                                                             |
| `day-entry-modal`                                                                                   | #350 Day Entry shell              | 本物の `role="dialog"` と mobile sheet の同じ modality/DOM contract へ移す。既存 test ID は維持し、背後操作を force click で成立させない         |
| `current-period-range-start/end`, `initial-period-range-start/end`, `create-period-range-start/end` | #360 primitive + #344/#346 caller | `testIdPrefix` で既存 field IDs を維持。raw value/touched/errors は parent 所有、primitive は controlled input/calendar と表示月だけを扱う       |
| 各 `*-apply`                                                                                        | #344/#346 caller-owned action     | primitive 内部から form action region へ移し、既存 ID は対応する semantic button と同じ目的で維持。save/submit ownership を primitive に戻さない |
| headings, buttons, alerts, dialog controls                                                          | 各 leaf の role/label/heading     | 文言変更時は該当 leaf が E2E assertion を同期。focus/scroll owner は §6、state owner は §5 に従う                                                |

### 10.2 Scenario-specific test owner map

| 実ファイル / scenario                                                                                                                                                                                                               | owner と移行方針                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/budget-summary-structure.test.ts` の summary entrypoint/child panel guard                                                                                                                                               | #330。read-only `BudgetSummary` と shell wiring を検証し、budget draft/save state を Summary に戻さない                                                                                                                                                                   |
| `tests/unit/calendar-grid.test.ts` の date conversion、cross-month、empty/reversed month cases                                                                                                                                      | #331。Calendar day-state/helper の保護。period range validation semantics は #346/#360 へ重複移管しない                                                                                                                                                                   |
| `tests/e2e/dashboard.spec.ts`: empty shell、period creation and budget update、malformed budget、range update/shrink rejection、current/future switch、secondary create                                                             | empty shell/selection/summary は #330、create 部分は #344、budget update と malformed budget は移設時 #330・改善後 #345、range update と saved entry を除外する shrink rejection は #346。`creates period and updates budget` は create→#344、budget→#330/#345 に分割する |
| `tests/e2e/dashboard-day-entry-add-edit.spec.ts`、`dashboard-day-entry-mobile-controls.spec.ts`、`dashboard-day-entry-modal-state-reset.spec.ts`                                                                                    | 日次 input/modal/sheet lifecycle は #350、History row edit/delete/display は #351。同一 file を一括で別 owner に移さず scenario 単位で更新する                                                                                                                            |
| `tests/e2e/dashboard-day-entry-failure-handling.spec.ts`                                                                                                                                                                            | malformed day yen、day save failure は #350、history load failure は #351、`shows save error and keeps input on failed period update` は移設時 #330・予算 UI変更時 #345。各 alert/draft保持の owner を混ぜない                                                            |
| `tests/e2e/dashboard-day-entry-delete-recalculation.spec.ts`、`tests/integration/api/periods-day-history.test.ts`                                                                                                                   | History last-row delete、recalculated used amount、reload 後の値は #351 が UI regression owner。integration API は domain/DB 根拠として変更しない                                                                                                                         |
| `tests/e2e/dashboard-day-entry-save-race.spec.ts`、`dashboard-day-entry-save-session-race.spec.ts`、`dashboard-day-entry-summary-completeness.spec.ts`                                                                              | Day Entry generation/session/result adoption は #350。save race、reopened same-day、old-day refresh、fuller concurrent summary の保護を #334 へ先送りしない                                                                                                               |
| `tests/e2e/dashboard-history-mutation-races.spec.ts`、`tests/e2e/dashboard-cross-mutation-races.spec.ts`                                                                                                                            | History row mutation/reload と day add ↔ history ordering は #351/#363。既存同日 add の並行許可と cross-kind queue を弱めない                                                                                                                                             |
| `tests/unit/period-controller-selection-races.test.ts` の `clears summary loading when a superseding period-list request fails`、`keeps selection owned by the visible summary when a created period summary fails`                 | #378（#333 child）と #363。POST success + GET failure の visible selection 保護と GET-only retry を検証し、#330 UI testへ埋め込まない                                                                                                                                     |
| `tests/unit/period-controller-selection-races.test.ts` のその他 selection/queued update cases                                                                                                                                       | #363。新 period の選択、old add、queued update、stale response の controller ordering を保護                                                                                                                                                                              |
| `tests/e2e/dashboard-period-switch-modal.spec.ts` の desktop/mobile period switch while Day Entry open                                                                                                                              | #350。背景 selector 操作は close → selection の到達可能な通常 flow に移し、close/focus restoration と新 period heading を確認する。controller session 終了/stale rejection の代替にしない                                                                                 |
| `tests/unit/dashboard-history-period-return.test.ts`、`tests/unit/period-controller-selection-races.test.ts` と day-entry generation/period-sequence assertions                                                                     | #350/#363。外部 period change 後の session close、hidden result rejection、History retained body を維持する。欠けた assertion は後続 leaf の最小 controller test で補う                                                                                                   |
| `tests/unit/period-controller-confirmation.test.ts`、`period-controller-summary-races.test.ts`、`period-controller-selection-replay.test.ts`、`cross-kind-summary-mutation-races.test.ts`、`period-summary-mutation-queue.test.ts`  | #363/#345/#346/#347。confirm once、authoritative cancel、stale proposal/conflict、summary replay、queue ordering を controller contract として維持                                                                                                                        |
| `tests/e2e/dashboard-period-boundary-confirmation.spec.ts`、`period-boundary-confirmation-success-scenarios.ts`、`period-boundary-confirmation-adversarial-scenarios.ts`                                                            | #346/#347。accessible alertdialog cancel/no-write、desktop/mobile confirm、double-submit、stale 409、no-dialog budget-only/extension、invalid successor no-write を保持                                                                                                   |
| `tests/integration/api/period-boundary-persistence.test.ts`、`tests/integration/api/period-boundary-generated-sql.test.ts`、`tests/integration/api/periods-validation.test.ts`、`tests/integration/api/periods-day-history.test.ts` | domain/DB evidence として変更しない。UI owner が API semantics や D1 atomicity を引き取ることを禁止する                                                                                                                                                                   |

### 10.3 Focused verification map（実装後）

`pnpm exec vitest run tests/unit/period-controller-confirmation.test.ts tests/unit/cross-kind-summary-mutation-races.test.ts tests/unit/period-summary-mutation-queue.test.ts`、
`pnpm exec playwright test tests/e2e/dashboard-period-boundary-confirmation.spec.ts`、
`pnpm exec playwright test tests/e2e/dashboard-day-entry-mobile-controls.spec.ts tests/e2e/dashboard-period-switch-modal.spec.ts`
は該当 leaf の focused verification とする。移行後も同じ scenario purpose と binary observable
を維持する。

## 11. work package / dependency / handoff

Issue #239 の child graph と #329 の後続責務を、hard dependency、推奨順、handoff、path boundary に分けて固定する。

### 11.1 Hard dependency

| work package                       | Depends on                                                  | Blocks / boundary                                                                                 |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| #329 UX contract                   | —（#239 は parent context であり hard dependency ではない） | #330、#360、#363、全 downstream の implementation contract。製品コードは変更しない                |
| #330 app shell / read-only summary | #329                                                        | #331、#344 shell、#345 budget relocation、#350 の shell handoff                                   |
| #331 Calendar                      | #330                                                        | #350 の open/focus handoff                                                                        |
| #350 Day Entry shell               | #330、#331                                                  | #351 fixed History region、#334 integration                                                       |
| #351 History internals             | #350                                                        | #334 integration                                                                                  |
| #360 shared range primitive        | #329、#330                                                  | #344、#346。#360 は create/update/confirmation semantics を待たずに primitive contract を確定する |
| #363 operation controller state    | #329、#330                                                  | create prerequisite、#345、#346。#363 は #344 の create UIを実装しない                            |
| #378 create-state prerequisite     | #329、#330、#363                                            | #344。#329 完了をこの prerequisite の実装完了へ逆依存させない                                     |
| #344 create form                   | #330、#360、#378                                            | #334。初回/追加 create body と POST/GET recovery を所有                                           |
| #345 budget settings               | #330、#363                                                  | #346。budget UI/focus を所有し controller state を再設計しない                                    |
| #346 range settings                | #345、#360、#363                                            | #347。ordinary range → proposal-pending までを所有                                                |
| #347 linked confirmation           | #346、#237/PR #245 semantics                                | #334。proposal confirm/stale/recovery を所有し range primitiveを再設計しない                      |
| #334 integration                   | #329/#330/#331/#350/#351/#360/#344/#363/#345/#346/#347/#378 | 全 leaf の統合後にのみ開始。#332/#333/#239 は child state確認後に close                           |

この graph に #329 → #378 の実装完了という循環を作らない。#332/#333 は sub-Epic として実装 PR を作らず、#334 完了後に child state を再確認して管理上 close する。

### 11.2 Recommended order

一人で順次進める推奨順は次のとおりである。これは hard dependency の代替ではなく、レビューと handoff を短くする順序である。

`#329 → #330 → #331 → #350 → #351 → #360 → #363 → (#378 → #344) / #345 → #346 → #347 → #334`

#344 と #345 は #360/#363 が揃えば相互独立であり、#344だけが #378 を必要とする。#360/#363 は Day Entry/History の完了を技術的には必要としないが、単一 writer では #351 後に期間管理へ移る。#334 は全 leaf と #378 の実 state が確認されるまで開始しない。

### 11.3 Allowed / no-touch path matrix

| owner | allowed paths / artifacts                                                                                                                                                                                                                                                           | no-touch boundary                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| #329  | `DESIGN.md` と必要な downstream Issue body synchronization                                                                                                                                                                                                                          | product code、CSS、API/server/domain/DB、test implementation。Issue comments/labels は変更しない                                |
| #330  | `src/routes/+page.svelte`、`src/lib/components/dashboard/DashboardWorkspace.svelte`、`BudgetSummary.svelte`、shell/summary adapters、対応 structure guard                                                                                                                           | Calendar/Day Entry/History internals、operation controller semantics、`src/routes/api/**`、`src/lib/server/**`、`migrations/**` |
| #331  | `src/lib/components/PeriodCalendar.svelte`、`calendar/**`、day-state/helper、Calendar focused tests                                                                                                                                                                                 | Day Entry modality/form、summary recalculation、API/domain/DB                                                                   |
| #350  | `src/lib/components/DayEntryModal.svelte`、`day-entry/DayEntryForm.svelte`、preview、固定 History slot、`day-entry-mutation-lifecycle.ts`、`day-entry-controller-state.svelte.ts` と必要最小限 page adapter/test                                                                    | #351 History internals、API/queue/revision semantics、server/domain/DB。success adapter は `daySaveSuccess` の公開に限定        |
| #351  | `src/lib/components/HistoryPanel.svelte`、`src/lib/components/day-entry/HistoryRow.svelte`、fixed-region 内 wrapper/aria wiring、History local tests/E2E                                                                                                                            | #350 modality/DOM order/scroll/global focus、Day Entry form/save、API/replay/recalculation/domain                               |
| #360  | `src/lib/components/PeriodRangePicker.svelte`、`PeriodRangeCalendar.svelte`、`PeriodRangeInputRow.svelte`、`period-range-state.ts`、`src/lib/components/dashboard/CreatePeriodPanel.svelte`/`PeriodSettingsPanel.svelte` の必要最小限 caller adapter と pure helper/primitive tests | create/update/confirmation semantics、parent draft/touched/validation ownership、API/server/domain/DB                           |
| #363  | `src/lib/dashboard/period-controller-state.svelte.ts`、`period-controller-actions.svelte.ts`、`period-controller-update-effect.ts`、confirmation state、必要最小限 page adapter/controller tests                                                                                    | UI form layout、range primitive、create form body、API/server/domain/DB                                                         |
| #378  | `period-controller-state.svelte.ts`、`period-controller-create-effect.ts`、`period-controller-actions.svelte.ts`、必要最小限 page adapter/test                                                                                                                                      | #344 form UX、#363 budget/range state、API idempotency、API/server/domain/DB                                                    |
| #344  | `src/lib/components/dashboard/CreatePeriodPanel.svelte` と create adapter/form tests                                                                                                                                                                                                | #330 shell、#360 primitive internals、controller prerequisite implementation beyond public fields、API/server/DB                |
| #345  | `src/lib/components/dashboard/PeriodSettingsPanel.svelte` budget region と budget focused tests                                                                                                                                                                                     | range/create/confirmation region、#363 controller contract、API/server/domain/DB                                                |
| #346  | `src/lib/components/dashboard/PeriodSettingsPanel.svelte` range region と range focused tests                                                                                                                                                                                       | #347 confirmation UI、#360 primitive internals、#363 state contract、API/server/domain/DB                                       |
| #347  | `src/lib/components/dashboard/PeriodBoundaryConfirmationDialog.svelte` と confirmation adapter/tests                                                                                                                                                                                | range draft/primitive/ordinary save、#237/PR #245 server/D1 semantics                                                           |
| #334  | integration/regression/selector cleanup と全既存 focused/full checks                                                                                                                                                                                                                | 新しい主要UX判断、shared primitive/controller contract、API/server/domain/DB semantics                                          |

すべての leaf は `src/routes/api/**`、`src/lib/server/**`、`migrations/**` を no-touch とする。必要な controller prerequisite は独立 Issue として graph に置き、既存 UI Issue へ暗黙に混在させない。

### 11.4 Handoff contract

| handoff                    | 渡すもの                                                                              | 渡さないもの                                              |
| -------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| #329 → #330                | §3 shell/DOM order、read-only Summary props、selector anchor                          | budget mutation state、Calendar/Day Entry internals       |
| #330 → #331                | selected period、Calendar placement、`period-select`/`period-id`                      | Day Entry modality、summary calculation                   |
| #331 → #350                | date open callback、`calendar-day-<date>` focus origin、day state labels              | dialog shell、History row semantics                       |
| #350 → #351                | fixed History slot、region heading/aria relationship、scroll/DOM contract             | modality、global focus、Day Entry form/save               |
| #360 → #344/#346           | controlled range props、`onValueChange`/`onFieldBlur`、field IDs/errors、testIdPrefix | submit/save/cancel、server feedback、proposal state       |
| #363 → #345/#346           | committed values、independent draft/status actions、full PUT adapter、interlock       | component layout、primitive internals                     |
| create prerequisite → #344 | typed create fields/actions、POST/GET recovery、created ID/status                     | create form visual composition、range primitive internals |
| #345 → #346                | committed budget/settings region contract                                             | budget draft、budget action error、budget UI ownership    |
| #346 → #347                | proposal-pending target/successor/before/after、request sequence/revisions            | ordinary range form、primitive、budget draft              |
| all leaf → #334            | completed paths, focused verification, preserved semantics evidence                   | unfinished child checklist or new design alternatives     |

`#350` の最小 success adapter は typed `daySaveSuccess` の公開と status handoffだけを含む。`#360` の blur contract は parentへ `onFieldBlur(field): void` を通知するが、touched/validation stateを primitiveへ戻さない。

### 11.5 Public Issue synchronization rules

公開後の Issue 同期は次の durable rules に従う。

- #329 の [公開 DESIGN.md](https://github.com/sh4869221b/yosan-flow/blob/main/DESIGN.md#11-work-package--dependency--handoff) URL と節 anchor を #239 および必要な downstream Issue body から参照する。PR merge 前のIssue同期ではcandidate branch URLを使い、merge後にこの main URLへ切り替える。DESIGN.md 自体には durable な main URLだけを記載する。
- Issue body は既存の目的、対象、制約、checklist、comments、labels を保持し、#329 contract と実際の dependency/path boundary に直接不整合がある箇所だけを更新する。
- #332/#333 は sub-Epic として実装 PRを作らず、#334 の統合確認後に child state と checklist を確認して close する。#239 は #334 後に close する。
- #378 は #333 の create-state prerequisite であり、#344 の hard dependency として Parent/Depends on/Blocks と関連 body に記載する。
- #237/PR #245 の既存 linked-period protocol は根拠として参照し、履歴や既存 semantics を書き換える同期対象にはしない。
- 外部反映時は各 Issue の編集直前に live body を再取得し、他者変更を保持してから dependency、handoff、contract の必要差分だけを適用する。

## 12. gap inventory

| gap                                                          | 分類                               | owner / dependency            | status and resolution                                                                                           |
| ------------------------------------------------------------ | ---------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Day Entry が現行 section card で dialog semantics を持たない | UX contract / adapter              | #350 ← #330/#331              | desktop dialog/mobile sheet、true modality、focus lifecycle、fixed History region を §4/§6/§11 で確定           |
| range picker が内部 state/apply を所有する                   | controller/primitive prerequisite  | #360 ← #329/#330              | controlled value、blur callback、raw draft parent ownership、caller-owned actionを §7/§11 で確定                |
| budget/range/create が shared saving/error を使う            | controller prerequisite            | #363 ← #329/#330              | budget/range operation state と full PUT adapterを分離。create stateは別 prerequisiteへ境界付け                 |
| POST 成功後 GET 失敗の create recovery state が不足          | controller prerequisite            | #378 → #344                   | typed fields、created ID保持、GET-only retry、double-submit防止を定義                                           |
| create-state prerequisite の登録                             | dependency / external registration | #333 → #378                   | #378 の本文、graph、関連 Issue の dependency/path boundary を同期済み                                           |
| current selector/test contracts と新 surface の境界          | migration                          | #330/#331/#350/#360/#344/#346 | §10 selector map、caller-owned `-apply`、true dialog migration、semantic locator ownerを確定                    |
| mixed budget/day/history failure file の owner ambiguity     | test migration                     | #345/#350/#351                | `dashboard-day-entry-failure-handling.spec.ts` を scenario単位で分担し、budget failureをday/historyへ漏らさない |
| Day-save success を open/closeだけで推測できない             | lifecycle adapter                  | #350                          | typed `daySaveSuccess`、generation/period/sequence guard、success status retentionを §4.1/§11 で定義            |
| linked proposal/confirm protocol                             | preserved existing behavior        | #346/#347, #237/PR #245       | existing full-snapshot/409/no-write/atomic semanticsを変更せず §5/§9/§10 の UI handoffへ接続                    |
| final integration と旧 selector cleanup の開始条件           | integration gate                   | #334 after all leaves         | all leaf + prerequisite merge/state確認後に regression/cleanupを実施。#332/#333/#239 closeは後段                |

既存 API/server/domain/D1 gap は確認されておらず、UI leafへ混在させない。#378 は controller/page
adapter の prerequisite として、#344 の create form から利用する。

## 13. acceptance mapping

以下は live #329 の `完了条件` 21 項目を原文のまま対応付けた表である。チェック済みを意味せず、
文書節、後続 owner、確認方法を先に固定する。

|   # | 受入条件原文                                                                         | 文書節                | 後続 owner                                   | 確認方法                                                 |
| --: | ------------------------------------------------------------------------------------ | --------------------- | -------------------------------------------- | -------------------------------------------------------- |
|   1 | 主要user flowが開始・完了・cancel・error recoveryまで文書化されている                | §2                    | #329                                         | 9 flow を開始/完了/cancel/error の同じ表で QA-by-read    |
|   2 | 新しいinformation architectureが決定されている                                       | §3                    | #330                                         | §3 と #330 の shell 実装境界を読解                       |
|   3 | 主要screen / componentの責務が決定されている                                         | §4                    | #330/#331/#344/#345/#346/#347/#350/#351      | component responsibility matrix と Issue boundary を突合 |
|   4 | 主要componentのprops / events / slots / controlled state contractが決定されている    | §4, §7                | #360 と各 surface owner                      | public contract 表、type/check、focused QA               |
|   5 | committed / draft / dirty / reset / cancelのownerが決定されている                    | §5                    | #363 + create prerequisite                   | state ownership/transition 表と race/recovery QA         |
|   6 | 主要mutationのstate transitionが決定されている                                       | §5                    | #363/#344/#345/#346/#347/#350/#351           | transition matrix と mutation scenario                   |
|   7 | error / success / warning / loading / empty / stale / conflictの規則が決定されている | §6                    | #330/#344/#345/#346/#347/#350/#351           | feedback/focus/scroll 規則と各 surface の focused QA     |
|   8 | Calendarのday-stateとkeyboard contractが決定されている                               | §8                    | #331                                         | day-state/keyboard 表と Calendar E2E                     |
|   9 | Day Entryのmodality、DOM order、focus lifecycle、固定History regionが決定されている  | §6                    | #350 → #351                                  | desktop/mobile dialog/sheet 読解と focused browser QA    |
|  10 | `PeriodRangePicker`のform-neutral public contractが決定されている                    | §7                    | #360                                         | props/callback/error/reset 表と primitive QA             |
|  11 | #346 / #347の`proposal-pending` handoffが決定されている                              | §5, §11               | #346 → #347                                  | transition と handoff graph、stale/cancel scenario       |
|  12 | desktop / mobileのDOM order、scroll、overflow、primary actionが決定されている        | §3, §6                | #330/#350/#360                               | 320/375/768/1280 幅の document QA と browser QA          |
|  13 | preserved API / controller / domain / DB semanticsが明文化されている                 | §9                    | all leaves                                   | source/tests と preserved list の突合                    |
|  14 | selector / E2E migration ownerが決定されている                                       | §10                   | #330/#331/#350/#351/#360/#344/#345/#346/#347 | selector map と対象 E2E の owner 読解                    |
|  15 | leafごとのallowed / no-touch filesが明文化されている                                 | §11                   | #329                                         | work-package path matrix と diff scope                   |
|  16 | hard dependencyと推奨実行順が分離されている                                          | §11                   | #329                                         | graph と推奨順の別記を読解                               |
|  17 | gap inventoryが完成し、必要なprerequisite Issueが作成されている                      | §12                   | #329                                         | #378 の live state、body、graph 参照を確認               |
|  18 | #239と全downstream Issue本文がUX契約と同期している                                   | §11-§13               | #329                                         | live body 再取得と設計節/依存 graph の突合               |
|  19 | 後続PRが大きな設計判断をやり直さず実装できる                                         | §1-§12                | #329                                         | decision-complete prose review、各 leaf handoff          |
|  20 | 製品コードのUI挙動を変更していない                                                   | §1, §9                | #329                                         | `git diff --name-only` と scope check（DESIGN.md のみ）  |
|  21 | そのPR時点のCI aggregate `quality`が成功する                                         | §13 / delivery record | PR delivery                                  | CI quality jobs の live result                           |
