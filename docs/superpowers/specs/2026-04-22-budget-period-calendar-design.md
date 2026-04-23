# Yosan Flow 任意期間カレンダー設計書 v2.0

## 1. 目的

本設計書は、既存の月次予算モデルを任意の開始日・終了日を持つ予算期間モデルへ移行し、
以下の変更を加えるための設計を整理する。

- カレンダー上で日別入力を表示し、履歴確認を同一導線に載せる
- 適切な UI ライブラリとして `Bits UI` を採用する
- 予算期間に終了日を設定できるようにする
- 次の期間の開始日は前期間の終了日の翌日にする
- 按分を「期間総額から月内総使用額を引く」方式ではなく、
  「当日の割当を基準に当日使用額を差し引き、翌日になったら残額を再按分する」方式へ変更する

## 2. 確定仕様

### 2.1 予算期間

- 予算の管理単位は `yearMonth` ではなく `budget period` とする
- 各期間は `start_date` と `end_date` を持つ
- 期間は月をまたいでよい
- 期間重複は禁止する
- 次期間を前期間から連続して作る場合、`next.start_date = previous.end_date + 1 day` とする
- 期間の総予算は 1 期間につき 1 つ保持する

### 2.2 カレンダー表示

- 期間に含まれる日を月カレンダーで表示する
- 各日のセルには、その日の入力合計を表示する
- 履歴はセル内に直接列挙せず、日セルクリックで詳細モーダルを開いて表示する
- 日次入力機能としての `add / overwrite` は維持する
- ただし旧 month/day API の後方互換は維持しない。日次入力は period API 配下へ一本化する

### 2.3 終了日

- 期間作成時に開始日・終了日を指定できる
- 既存期間の終了日変更を許可するが、前後期間との重複は許可しない
- 終了日変更後は対象期間の日数と按分結果を即時再計算する

### 2.4 再按分

- 再按分の基準は「現在日を起点とする残区間」とする
- 当日の推奨額は、当日を含む残日数に対して残予算を均等配分して算出する
- 当日に使用額が入力された場合、その使用額は期間総額から直接引くのではなく、
  まず当日割当に対する消化として扱う
- 翌日になったら、前日までの確定使用額を反映した残予算を
  残り日数で再按分する
- 端数は先頭日から 1 円ずつ前倒し配分する
- 予算超過時は、その日以降の推奨額を 0 円表示し、超過額を別表示する

## 3. 採用方針

### 3.1 UI ライブラリ

`Bits UI` を採用する。

理由:

- Svelte 5 と相性がよい
- 現在のリポジトリに Tailwind がなく、`shadcn-svelte` より導入差分を小さくできる
- `DatePicker` / `RangeCalendar` / `Calendar` を使って、期間入力と日別カレンダーを同じ設計思想で構成できる

参考:

- [Bits UI Date Picker](https://www.bits-ui.com/docs/components/date-picker)
- [Bits UI Range Calendar](https://www.bits-ui.com/docs/components/range-calendar)
- [Bits UI Dates](https://www.bits-ui.com/docs/dates)

### 3.2 データ保持方針

- 推奨日次予算は保存しない
- 期間、日次合計、履歴を保存し、推奨値・差分・残予算はレスポンス生成時に算出する

## 4. データモデル

### 4.1 新規主テーブル

`budget_periods`

- `id`
- `start_date`
- `end_date`
- `budget_yen`
- `status`
- `predecessor_period_id`
- `created_at`
- `updated_at`

制約:

- `start_date <= end_date`
- 期間重複禁止
- `predecessor_period_id` がある場合、前期間の終了日との接続が取れること

### 4.2 既存テーブルの拡張

`daily_totals`

- `budget_period_id` を追加する
- `date` は期間内日付のみを受け入れる

`daily_operation_histories`

- `budget_period_id` を追加する
- 日別取得と期間内絞り込みの両方を可能にする

### 4.3 返却用派生値

- `periodLengthDays`
- `daysRemaining`
- `spentToDateYen`
- `remainingYen`
- `overspentYen`
- `todayRecommendedYen`
- `varianceFromRecommendationYen`
- `remainingAfterDayYenPreview`

## 5. ドメインルール

### 5.1 日付所属

- 日次入力対象日は必ず対象期間の `start_date <= date <= end_date` を満たす
- 期間外日付の add / overwrite は拒否する

### 5.2 再按分計算

基準日を `T`、期間予算を `B`、`T` より前の確定使用額を `S_before` とする。

- `remaining_at_T = B - S_before`
- 残日数 `D = end_date - T + 1`
- 当日推奨額は `remaining_at_T / D` の端数前倒し配分で求める
- 当日に入力された `used_at_T` は、当日セルでは推奨額との差分として表示する
- 翌日 `T+1` では `S_before` に `used_at_T` を含めて再計算する

このため、未来日に入力済みの金額は履歴・セル表示には反映するが、
当日の推奨額計算は「現在日までの確定消化」を主軸に行う。

### 5.3 履歴表示

- カレンダーセルでは日合計のみ表示する
- 日詳細モーダルでは、その日の履歴を新しい順で表示する
- 履歴削除は今回の対象外とする

## 6. API 設計

既存の `months/:yearMonth` 軸は段階的に縮退させ、新規に `periods` 軸を追加する。

補足:

- ユーザー指示により DB 再作成を許容するため、旧 month/day API の後方互換は提供しない
- 旧 endpoint は移行期間の live path とせず、period API を唯一の更新経路とする

### 6.1 期間 API

- `GET /api/periods/:periodId`
  - 期間サマリ
  - カレンダー日別行
  - 今日の推奨額
- `POST /api/periods`
  - 期間作成
- `PUT /api/periods/:periodId`
  - 総予算、開始日、終了日の更新

### 6.2 日次 API

- `POST /api/periods/:periodId/days/:date/add`
- `PUT /api/periods/:periodId/days/:date/overwrite`
- `GET /api/periods/:periodId/days/:date/history`

## 7. UI 設計

### 7.1 画面構成

1. 期間ヘッダ
- 開始日
- 終了日
- 総予算
- 残予算
- 今日の推奨額
- 次期間開始予定日

2. カレンダー本体
- 月グリッドで期間内日を表示
- 各セルに日付と入力合計を表示
- セルクリックで日詳細モーダルを開く

3. 日詳細モーダル
- 日別履歴一覧
- add / overwrite 入力
- 当日推奨との差分
- 保存後プレビュー

### 7.2 コンポーネント方針

- `Bits UI DatePicker` または `RangeCalendar` を期間入力に使う
- 表示用カレンダーは `Bits UI Calendar` をベースに、日セルをアプリ用途向けに拡張する
- 既存 `DayEntryModal` / `HistoryPanel` は統合または責務再編する

## 8. テスト方針

### 8.1 Unit

- 任意期間の日付列挙
- 前期間終了日の翌日が次期間開始日になること
- 当日差分計算
- 翌日再按分
- 超過時 0 円配分

### 8.2 Integration

- 期間重複禁止
- 期間外日次入力拒否
- 終了日更新時の再計算
- 日次入力後の期間サマリ更新

### 8.3 E2E

- 期間作成
- 終了日設定
- カレンダー表示
- セルクリックで履歴モーダル表示
- 当日入力後に差分と残額が更新されること

## 9. 移行方針

- 既存 `monthly_budgets` 起点 API と UI は一度に削除しない
- まず `budget_periods` と `periods` API を追加し、新 UI を切り替える
- 既存月次コードは、移行完了後に整理する

## 10. リスク

- 既存 `yearMonth` ベース実装との二重管理期間が一時的に発生する
- 再按分仕様が「未来日入力をどこまで当日計算へ含めるか」で解釈ずれしやすい
- カレンダー UI はアクセシビリティとクリック導線を E2E で固める必要がある
