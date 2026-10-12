# Nix と案1コンテナーの比較

追記: この文書はローカル段階の記録です。承認後に実施した同条件 GitHub Actions 比較は [hosted 結果](hosted-e2e-comparison.md#hosted-result-2026-10-12-utc) を参照してください。

2026-10-12 UTC、前回の試作・測定を引き継いだ追加調査です。**この環境では既存 Nix 方式を実行できず、速度の優劣は未確定です。** 別の GitHub runner の数字や、準備に失敗した PR の時間を混ぜて勝敗を出していません。

## 同条件にできた範囲と実行障害

比較対象を application baseline `93e4100a6f4cd245bc50cd2a0f2f560d352d16ec`、implementation `5f45253a6e326524389e227645b61074338fad54`、Node 24.21.0 / pnpm 12.10.1 / resolved Playwright 1.63.0 / Wrangler 4.148.0、143テスト、２ shard、各１ worker に固定しました。途中の main 更新は取り込んでいません。Nix の flake / installer / preparation / shared pnpm helper は元コミットと byte-for-byte 同じです。テスト、安全チェック、reset token、local-intent guard は変更していません。

追加計測は `codex/experiment-nix-comparison`、`/workspace/yosan-nix-comparison` の独立 worktree（同じ `5f45253`）と `.tmp-comparison/` だけを使用しました。既存の pnpm store、前回 archive、テスト結果、他用途 cache / データは消していません。開始時 Docker images / containers / volumes / build cache はすべてゼロでした。今回取得した image だけを終了後に整理し、測定用 raw tar だけを削除しています。

Nix の確認結果:

- `command -v nix`: なし。`/nix`: なし。UID 1000、`/` は書込み不可。
- `bash scripts/nix-e2e.sh tools`: exit **127**、`nix: command not found`。tools / evaluate の failure timing も記録されました。
- `unshare --user --map-root-user --mount true`: exit **1**、`cannot open /proc/self/uid_map: Read-only file system`。probe の子プロセスだけで終了し、設定は変更していません。
- 既存 pin の公式 Nix 2.26.3 archive は取得でき、SHA-256 `d378a057253fb98f05c3e7c431c1852cca6afae3376f5853a9fcb7ae423a05ad` と一致しました。しかしインストール・Nix executable 実行・closure 取得には進めていません。

標準 single-user installer は `/nix` がなければ sudo で作り、そのユーザーの所有にする仕様です。[公式 Nix installation](https://nix.dev/manual/nix/2.26/installation/installing-binary#single-user-installation) に従う host permission 操作は今回の依頼範囲で禁止されているため、実施しませんでした。別 root の chroot store による実行も user/mount namespaces が必要です。[公式 Local Store](https://nix.dev/manual/nix/2.26/store/types/local-store) の条件をこの namespace probe が満たせません。

権限昇格、daemon 導入、sysctl、security 設定、署名/TLS 検証の無効化、ローダー差替え、別 runner / Docker 内の別 Nix 環境を「同じ host の Nix 実測」と扱う回避はしていません。Nix は install、Node/browser/font closure、依存導入、build、143テスト、cache 保存・復元の **cold / warm とも未実行** です。0秒ではなく **未比較** です。

## E2E の既存実測を引き継いだ比較枠

コンテナーは前回、同じ SHA / image ID で各条件１回ずつ、合計143件を初回・warm の双方で成功しました。失敗・flaky・skip はゼロです。Nix が setup で止まるため、この追加調査でコンテナーの143テストだけを再実行して比較母数を増やすことはしていません。

| 条件                                              | コンテナー shard 1/2、2/2        | Nix 同じ143テスト |
| ------------------------------------------------- | -------------------------------- | ----------------- |
| warm-base、依存 store 空、終了時 cache 保存を含む | 292.1秒 / 249.1秒、82 / 61件成功 | 未実行            |
| warm-base、同じ依存 store、archive 読込を含む     | 175.4秒 / 132.1秒、82 / 61件成功 | 未実行            |
| 依存導入（初回 → warm）                           | 50.9 → 46.0秒 / 45.7 → 40.8秒    | 未実行            |
| browser / Japanese font / FFmpeg smoke            | 0.6〜0.8秒                       | 未実行            |
| app build                                         | 約11.9〜12.7秒                   | 未実行            |
| Playwright（初回 → warm）                         | 82.4 → 79.8秒 / 48.9 → 49.1秒    | 未実行            |

上表はベース/derived image が取得済みの **warm-base** 条件です。コンテナーも完全 cold pipeline の時間ではありません。初回と warm の差には cache archive を初回に作る／warm で読む差が含まれ、依存 cache の効果だけではありません。依存導入は policy verification と network を含むため、store が warm でも約40秒以上かかりました。指標は重なるので、startup、build、Playwright を合算して job 時間にしません。[前回の全記録](container-e2e-results.md) を参照してください。

## 初回取得と cache 操作の追加実測

同じ cloud host、Docker 28.4.0 / `vfs`、既存 proxy / CA のまま、各操作を逐次１回ずつ計測しました。ローカル Docker cache は開始時空でしたが、registry / CDN / proxy 側の cache は制御していません。Nix archive の23.8MBは installerだけで、E2E closure を含みません。

| 独立に測った操作                                 |     秒 | 状態・容量                                      |
| ------------------------------------------------ | -----: | ----------------------------------------------- |
| Nix official installer download                  |   2.56 | 23,763,568 bytes、hash 一致、導入は未実行       |
| Nix installer SHA-256 verify                     |   0.07 | 既存 pin に一致                                 |
| official Playwright base pull                    |  64.63 | 同じ `v1.63.0-noble` / amd64 digest、local miss |
| official Node base pull                          |   9.56 | `.node_version` と既存 digest、local miss       |
| 前回 derived archive load                        |  32.75 | base は取得済み、derived image は未登録         |
| derived image raw `docker save`                  |  14.04 | 2,753,157,632 bytes                             |
| raw tar の gzip                                  | 107.59 | 1,055,557,500 bytes（約1.06GB）                 |
| 同じ derived image が存在する状態の archive load |  11.46 | 復元時の登録済み layer cache 利用               |

derived image ID は前回と同じ `sha256:29f47beef0cbd1058871efbc214698f71712cda5062239bddb7601deabd7e252` です。raw save はこの ID を使い、前回の tag を使う archive と tag metadata が異なるため、compressed bytes のわずかな差は image 内容の変更ではありません。

今回の save→gzip は独立ステップであり、前回の `docker save | gzip` pipeline とは I/O の重なりが異なります。**14.04＋107.59秒を前回の292.1秒へ加算しません。** 取得64.63＋9.56秒も前回と別時点の測定です。APT font preparation / fresh Dockerfile build、Nix closure の取得・署名検証、GitHub cache 転送、post-job saving、artifact upload が未計測なので、これらを足して cold pipeline の優劣にしません。

Nix 全 store の容量・圧縮サイズは **未測定** です。「installer 23.8MB 対 image 1.06GB」という全体容量比較は成立しません。Nix は必要な headless shell を選び、公式 Playwright base は他の browser も含むものの、Nixpkgs source / installer / tool/font/library closures / cache DB まで含む store がどれだけになるかは計測が必要です。

## 実装を根拠にした運用比較

| 項目            | 既存 Nix                                                                                                                                                           | 案1コンテナー                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 再現性の範囲    | flake.lock の Nixpkgs、Node、browser/font/library closures と browser revision を固定。kernel と npm native pnpm / workerd の host loader/libc は残る              | MCR base と Node digest、Ubuntu userland/browser/libc と package lock を固定。kernel / Docker / resource policy は残る。derived image の APT snapshot は未固定                  |
| 署名と配布元    | `cache.nixos.org`、`require-sigs=true` と recursive `store verify --sigs-needed 1`。installer は official release archive の hash。cache miss 時は builds 0 で停止 | official MCR / Docker Node over TLS、Ubuntu APT signatures、digest content identity。OCI publisher signature / attestation は未検証。Nix と同じ保証ではない                     |
| npm の例外      | 共通 `pnpm-e2e.ts` が official npm bundle/native archive を lock の SHA-512 で検証。npm dependencies は frozen lock / supply-chain policy                          | 同じ113行の helper と frozen lock / policy を使用                                                                                                                               |
| Playwright 更新 | 固定 Nixpkgs driver、手書き driver/revision assertions、project resolved version と coherent である必要。対応 snapshot と signed cache outputs が必要              | resolved lock を image 取得前にチェック。matching official MCR release と digest の review が必要。installed test / Playwright / core、revision と actual browser を smoke 検証 |
| Node 更新       | Nixpkgs `nodejs-slim_24.version` と `.node_version` が一致する snapshot を選ぶ                                                                                     | `.node_version` から official Node tag を作り digest review、実 binary の版を検証                                                                                               |
| 準備の並行性    | 既存 workflow は browser preparation と build を background + wait                                                                                                 | inner runner は smoke → build → test を同一 container で直列。smoke 約0.7秒だが、並行性を完全維持した変更ではない                                                               |
| cache           | `/nix` と evaluation cache、pnpm store。署名検証後に再利用。全 store サイズと復元コストは未測定                                                                    | 約1.06GB compressed image + 別 pnpm store。tar save/load、圧縮・Actions 転送が重い可能性。`vfs` は layer/container 全体のコピーで disk を消費                                   |
| GitHub Actions  | 元 CI は `/nix` を sudo で準備し single-user/no-daemon。signed cache を使う Ubuntu hosted runner での設計だが、この cloud sandbox とは権限が異なる                 | Docker + `setup-node`（orchestration のみ）+ image/pnpm cache。build/verify/Wrangler/D1/test が同一 UID、container、path。hosted 実行は未検証                                   |
| テストと安全    | 143テスト、２ shard、１ worker、D1 guard、reset/local intent、prebuild identity、Quality、diagnostics を維持する既存方式                                           | 同じ items / guards を維持。追加の real FFmpeg video smoke を実施。非 E2E CI と通常開発は変更しない                                                                             |

署名設定の意味は [Nix configuration reference](https://nix.dev/manual/nix/2.26/command-ref/conf-file#conf-require-sigs)、公式 base の配布元・browser/system dependency 範囲は [Playwright Docker](https://playwright.dev/docs/docker) に基づきます。signature は trusted signer を認証しますが、絶対的安全性を保証するものではありません。digest を「署名より弱い再現性」と一括りにせず、content identity と publisher authentication を分けています。

更新待ちについて、現在の Nixpkgs snapshot で違う resolved Playwright を入れれば失敗することと、案1の tag/lock 不一致が preflight で失敗することは実装で確認できます。しかし「MCR は常に先に出る」「Nix は常に遅い」という公開 latency の実測はありません。両方とも更新時に一致する artifact を選ぶ review が必要です。

### 保守するコード量

同じ `5f45253` で `wc -l`（blank/comment 込み、docs/tests/workflow と generated lock を除外）:

- Nix: `flake.nix` 43、installer 36、shell preparation 44、TS preparation 171 = **294行 / 4 files**。flake.lock は別の生成入力として保持。
- コンテナー: config TS 66、prepare TS 26、smoke TS 88、inner shell 23、outer shell 71、Dockerfile 12、fonts.conf 11、image.json 4 = **301行 / 8 files**。
- 両者の共通 pnpm helper: **113行**。既存 E2E build/timing/summary/guards も共通で変更なし。

行数上、コンテナーが明らかに小さいとは言えません。現在の prototype は rollback/比較のため両方式を残しており、repo の保守総量は増えています。採用後に片方を整理する場合は別レビューが必要です。違いは code の量より、Nixpkgs snapshot の複数 tool version の整合と、container tag/digest・derived image distribution/cache の整合をどちらで管理するかです。

### CachyOS の利用

[CachyOS は Arch ベース](https://cachyos.org/)であり、[Playwright が列挙する Linux system requirements](https://playwright.dev/docs/intro#system-requirements) は Debian / Ubuntu です。**CachyOS で両候補を実行した検証はありません。**

実装からの推論として、案1は browser だけでなく Node、pnpm native executable、workerd、fonts を Ubuntu userland 内で実行するため、CachyOS の rolling userland/library 更新の影響を E2E から隔離しやすいです。host kernel、Docker の実行許可、storage driver、CPU architecture は引き続き必要です。この試作は amd64 Docker 用で、Podman や rootless engine を実装・検証したものではありません。

Nix は browser interpreter/RPATH と libraries、Node と fonts の署名付き closure を固定するため、Nixpkgs Linux outputs を使う利点があります。ただし既存コードの pnpm native executable と npm workerd は host loader/libc を使い、すべてが Nix-built ではありません。CachyOS で Nix が既に導入済みか、通常 `/nix` store を利用できるか、native npm binaries が実際に動くかを確認する必要があります。kernel/security 設定を変えて通す提案はしません。CachyOS の最適化による E2E の speedup も未検証です。

## 結論と次に必要な比較

機能面では案1が同じ143件を２条件で成功し、通常開発を Node/pnpm のままにする E2E-only の隔離案として成立しています。署名付き Nix closures の認証範囲は、この container prototype より明示的です。CachyOS と Ubuntu CI で E2E userland をそろえる目的には案1の isolation が合いますが、これは implementation に基づく運用上の判断で、速度の勝利宣言ではありません。

速度で採用を決めるためには、Nix が既に実行を許可されている同じ runner で、同じ SHA / 143 tests / shards / workers を使い、両方式の warm-base と empty dependency store / warm store を測る必要があります。Nix installer/closure/eval/signature checks、container base/build/load/save、pnpm policy、smoke、build、Wrangler/D1 startup、tests、Actions cache/diagnostics を分け、overlap を保持した job wall-clock で比較します。必要なら両方式を同じ許可済み隔離環境に置く別実験を設計できますが、それを現在の native Nix の実測と混同しません。

未確認は Nix cold/warm 全体、Nix store capacity、完全 cold derived build、hosted Actions の cache economics、CachyOS 実行、publisher attestation、APT snapshot reproducibility、update publication latency です。GitHub の別 runner の数字と混ぜて直接の優劣を断定していません。

今回の evidence / exact commands / times は `/workspace/yosan-nix-comparison/.tmp-comparison/` の `preflight.json`, `namespace-probe.log`, `nix-tools-attempt.log`, `costs.json`, `image-inspect.json`, `measurement.py` と各 stage log に保存しました。Nix archive と新しい compressed image も同じ隔離領域にあり、前回 cache は read-only input として使っただけです。push / PR / merge / deploy は実施していません。
