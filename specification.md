以下は、前回の改定案（フォント＝オブジェクトの一種、オブジェクトと関係を編集して `draw` する）を前提に、実装に落ちる粒度まで詳細化した仕様書（拡張版）です。名称は仮に PGR とします。

---

# 仕様書 v0.9 改定詳細

Project: Process Geometry Renderer（PGR）

## 1. 目的と到達点

1. 幾何（図形）、パターン、タイリング、文字（フォント）を同一の Scene モデルで扱う。
2. ユーザーは「オブジェクト」「関係」「生成規則」「時間 (t)」を UI で編集し、描画は `draw(Scene,t)` の評価結果として得る。
3. レンダリングは p5.js を描画バックエンドとして用い、Scene は宣言的データ（保存・再現可能）として保持する。
4. 任意の (t) の静止画生成、(t) 区間のフレーム列出力（アニメーション相当）を標準機能とする。
5. フォントは Scene 上のオブジェクトであり、特別扱いしない（Glyph/テキストは幾何の一種として扱う）。

---

## 2. 実行モデル

### 2.1 基本写像

レンダラは次を実装する。

[
Image = Render(Scene, t, RenderConfig)
]

* 入力：Scene（状態）、時刻 (t)、描画設定
* 出力：Canvas（表示）および任意のオフスクリーン画像（書き出し）

### 2.2 p5.js 側の役割

p5.js は「Scene を評価して描くだけ」のバックエンドであり、Scene を構成するロジックや UI の状態管理は p5 側に持たせない。

* setup：Canvas とバッファ初期化、`noLoop()`
* draw：`Render(Scene,t)` を実行し、結果を描画
* UI 操作：Scene を更新し、`redraw()` を呼ぶ（再生時は `loop()`）

### 2.3 起動・停止制御

* instance mode を前提とする（グローバルモードの自動起動に依存しない）。
* 「再初期化」は p5 インスタンス破棄（`remove()`）＋再生成、またはバッファ再生成で対応する。
* Scene の編集で `setup()` を再実行する設計は禁止する。

---

## 3. Scene データモデル（宣言的状態）

Scene は次の要素で構成される。

1. Objects：描画・参照対象の集合
2. Relations：オブジェクト間関係（拘束、接続、反復など）
3. Generators：オブジェクトや関係を生成する規則
4. Operators：幾何処理・画像処理・合成などの操作（任意）
5. Timeline：(t) によるパラメータ変化
6. RenderConfig：表示・出力の設定

Scene は JSON に直列化できること（完全再現性の条件）。

---

## 4. 型定義（厳密定義）

以下は「仕様上の型」であり、実装言語は TypeScript を想定して記述します（JS 実装でも同型を維持）。

### 4.1 ID と参照

* `ObjectId`：文字列（ユニーク）
* `RelationId`、`GeneratorId`、`OperatorId`：同様
* 参照は必ず ID による（ポインタや実体埋め込みは禁止）

不変条件：

* Scene 内で ID は衝突しない
* 削除された ID 参照は自動的に無効化され、レンダ時に安全に無視される（クラッシュ禁止）

### 4.2 数値・ベクトル・行列

* `Vec2 = (x:number, y:number)`
* `Mat3`：2D アフィン（3x3 の同次行列、または 6 要素の簡約表現）
* `Transform2D`：平行移動・回転・拡縮・せん断の合成として保持

推奨正規形：

* Transform は常に `Mat3` に評価される（内部表現は自由だが評価結果は `Mat3`）

### 4.3 時間依存パラメータ（Param）

Scene の多くの数値は (t) に依存可能。Param を共通化する。

`Param<T>` は次の 3 形態のいずれか。

1. Constant：固定値
2. Keyframes：キーフレーム補間
3. Expr：安全な関数形（最小要件では採用しない。採用するなら独自の式 AST で評価し、`eval` 禁止）

Keyframes の仕様：

* キーフレームは ((t_i, value_i)) の昇順列
* 補間は type 指定：step / linear / smooth（smooth はエルミート等、選定は実装に依存）
* 範囲外の (t) は clamp または repeat を指定可能（デフォルト clamp）

---

## 5. Objects（オブジェクト）

### 5.1 Object 共通構造

Object は次を持つ。

* id：ObjectId
* kind：ObjectKind
* name：表示名（UI 用）
* transform：TransformSpec（Param を含む）
* geometry：GeometrySpec（kind ごと）
* style：StyleSpec
* visibility：boolean
* tags：文字列配列（任意。UI フィルタ用途）

描画不変条件：

* visibility=false の Object はレンダ対象から除外
* style が未定義の項目は RenderConfig のデフォルトを用いる

### 5.2 ObjectKind（最小セット）

v0.9 の必須 kind は以下。

* Primitive：Point / Line / Polyline / Polygon / Rect / Circle
* Text：Glyph / TextRun
* Pattern：UnitCell / Lattice / TileInstance
* Composite：Group / Instance

### 5.3 GeometrySpec 詳細

#### 5.3.1 Primitive

* Point：位置は transform で表し geometry は空でもよい
* Line：2 点（ローカル座標）
* Polyline/Polygon：点列（ローカル座標）
* Rect：width,height,cornerRadius（任意）
* Circle：radius

点列の座標系：

* geometry の点は Object ローカル
* transform でワールドへ

#### 5.3.2 Text（フォント）

Text は「形状生成ソース」であり、最終的にベクタまたはラスタのどちらかとして評価される。

GlyphGeometry：

* fontAssetId：フォント資産参照
* char：単一文字
* size：Param<number>
* outlineMode：`vector` / `raster`
* vectorQuality：点密度または曲線近似許容（vector の場合）
* rasterAA：アンチエイリアス強度（raster の場合）

TextRunGeometry：

* fontAssetId
* text：文字列
* size：Param<number>
* layout：LayoutSpec（横組・縦組・円周などはここに入れる）
* glyphMode：`glyph`（内部的に Glyph 群へ展開）または `text`（まとめ描画）

重要制約：

* `outlineMode=vector` の場合は textToPoints 系か、外部輪郭抽出を用いる。
* `outlineMode=raster` の場合は p5 の `text()` でラスタ化し、画像処理系 Operator に入力できる。
* どちらも「最終的に Geometry（点列/ポリゴン）または Image（バッファ）」として扱えるよう、評価結果の型を明示する（後述）。

#### 5.3.3 Pattern / Tiling

タイリングは 2 系統を持つ。

A) 生成系（Generator が展開する Instance 群）
B) 評価系（Render 時に繰り返し描く）

v0.9 は A を必須、B は任意。

UnitCell：

* baseObjectIds：セル内の元オブジェクト集合
* cellVectors：(\mathbf{a},\mathbf{b})（2D 格子ベクトル）
* cellBounds：描画領域の指定（任意）

Lattice：

* unitCellId
* repeatRange：(i\in[i_0,i_1], j\in[j_0,j_1])
* transformPerCell：各セルに適用する変換（回転・鏡映など）
* clipping：描画領域で切るか（必須ではないが実用上重要）

TileInstance：

* sourceObjectId（元図形）
* instanceTransform（個別）

Composite：

* Group：子 objectId 群
* Instance：参照元 objectId と変換

---

## 6. Relations（関係）

Relations は「Scene の制約・接続・依存」を表す。
重要方針：Relation は描画命令ではなく、評価時に Object の transform/geometry を決めるための制約として働く。

### 6.1 Relation 共通

* id、type、targets（ObjectId 群）、params（Param を含む）
* enabled：boolean

評価規則：

* enabled=false は無視
* targets が欠ける場合は部分的に無効化（例：二項関係で片方欠損なら無効）

### 6.2 RelationType（必須セット）

1. Attach

* 子を親座標に拘束（親の transform を合成）
* params：offset（Vec2）、inheritRotation、inheritScale

2. Align

* A の基準点を B の基準点へ合わせる
* anchor：center/topLeft/baseline 等
* 文字の場合 baseline を扱えること

3. FollowPath

* A を Path（Polyline 等）に沿って配置
* params：u（0..1 の Param）、tangentAlign（接線方向へ回転）

4. Repeat（簡易反復）

* A を N 個複製し、規則で配置
* params：count、deltaTransform、indexParam（i に依存した追加変換）

5. Tile（タイリング拘束）

* unitCell と格子を用い Instance 群を生成するための関係
* 実体は Generator として実装してよいが、Scene 上は Relation として存在してよい（UI 的に扱いやすい）

v0.9 の優先：

* Repeat と Tile は「生成（expansion）」として実装し、結果は Object 群として Scene に展開される（評価時の動的反復ではない）。

---

## 7. Generators（生成規則）

Generator は「Object/Relation を生成し、Scene に展開する」仕組み。
編集操作としては「再生成」ボタンで展開し直す運用を標準とする（毎フレーム再生成はしない）。

### 7.1 Generator 共通

* id、type、inputIds（参照）、params（Param を含む）
* outputIds（生成された ObjectId 群。自動管理）
* seed（決定性が必要な場合）

### 7.2 GeneratorType（必須セット）

1. InstanceGenerator

* 参照元 objectId を複製し、変換列で配置する
* 反復・格子・円周・パス追従はこの特殊化として実装可能

2. GridGenerator

* (\mathbf{a},\mathbf{b}) に沿って範囲生成
* params：range、cellTransform

3. RadialGenerator

* 中心、半径、角度範囲、個数
* 文字円周配置などに直結

4. SubdivideGenerator（任意だが幾何系で重要）

* ポリゴンや領域を分割し、タイル候補を生成
* 最小要件は「分割結果を Polyline/Polygon として吐く」こと

Generator の出力は「通常の Object」として Scene に追加される。
生成物は `generatedBy` をメタ情報として持ち、手動編集可否（ロック）を指定できる。

---

## 8. Operators（操作：幾何処理・画像処理）

あなたの元要求（浸食やアフィン編集、過程ごとのレンダ）を、フォント限定ではなく一般化するための中核が Operators。

Operator は「入力（Object/Buffer）→出力（Object/Buffer）」の変換であり、過程可視化は Operator の中間出力を表示できることで実現する。

### 8.1 Operator の役割分離

* GeometryOperator：点列・ポリゴン・パスを変換
* RasterOperator：画像（バッファ）を変換
* ComposeOperator：複数入力を合成
* MeasureOperator：計測してパラメータへ反映（v0.9 では任意）

### 8.2 Operator 共通

* id、type、inputRefs、params、outputRef、enabled
* cachePolicy：none / perT / manual
* stageName：過程表示用ラベル

### 8.3 必須 OperatorType（v0.9）

1. AffineOperator

* Geometry と Raster の両方を入力可能
* ただし「Geometry に適用」と「Raster に適用」は別の mode として明示
* params：TransformSpec（Param）

2. RasterizeOperator

* Geometry → Raster（p5.Graphics）
* params：resolution、AA、threshold（任意）

3. ThresholdOperator

* Raster → Raster（二値化）
* params：threshold、mode（luma/alpha）

4. ErodeOperator

* Raster → Raster（浸食）
* params：radius、iterations、kernel（diamond/square 等）

5. DilateOperator（任意だが浸食と対）

* Raster → Raster（膨張）

6. BooleanOperator（幾何ブーリアン、任意）

* Polygon 同士の union/intersect/diff
* v0.9 では仕様枠だけ用意し、実装は後回しでもよい（ただし UI と Scene 表現は確定させる）

### 8.4 重要：評価結果の型（Typed Evaluation）

各 Object と Operator は「評価結果」を持つ。

* `EvalGeometry`：点列、ポリゴン、パス
* `EvalRaster`：p5.Graphics（または ImageData）

描画は `Eval*` を受けて行う。
これにより「Glyph はベクタにもラスタにもなれる」「浸食はラスタに対してだけ適用」などが型として整理される。

---

## 9. 評価順序（レンダの決定手順）

`Render(Scene,t)` は次の順で実行する。ここが実装の骨格になる。

1. Time の確定

* 現在 (t) を決める（UI 値、再生値、書き出し指定）

2. Asset 解決

* フォントなど外部資産がロード済みか確認
* 未ロードは代替表示（プレースホルダ）にし、クラッシュしない

3. Generator 展開（必要な場合）

* v0.9 標準は「手動再生成」。描画中は outputIds のみ参照
* 再生中に Generator を毎フレーム動かす設計はオプション扱い

4. Relation 解決

* Attach/Align/FollowPath 等で transform や配置を確定
* 解決不能な拘束はスキップし、警告フラグを UI に返す

5. Operator グラフ評価

* 入力依存をトポロジカル順に評価
* `cachePolicy=perT` のものは (t) ごとにキャッシュ可能
* 過程表示は Operator の任意段を選択して表示

6. Draw Adapter（p5 描画）

* `EvalGeometry` は p5 の line/shape 系へ変換
* `EvalRaster` は `image()` で描画
* Style を適用（stroke/fill/blendMode 等）

7. Overlay/UI 補助（任意）

* 選択中 Object のバウンディングボックス等（レンダ本体と分離）

---

## 10. レンダバックエンド（p5 Adapter 仕様）

### 10.1 バッファ管理

* `mainCanvas`：表示
* `gStage[]`：Operator 中間結果（必要時のみ保持）
* `gWorkA/gWorkB`：画像処理の ping-pong

解像度ポリシー：

* 表示解像度と出力解像度を分離できる
* 書き出し時は一時的に高解像度バッファで Render し、完了後に表示バッファへ戻す

### 10.2 描画命令の抽象化

p5 の immediate な API を Scene 側に漏らさないため、内部に次の Adapter 層を置く。

* `drawGeometry(EvalGeometry, StyleSpec)`
* `drawRaster(EvalRaster, StyleSpec)`
* `applyTransform(Mat3)`（geometry の場合は点列変換でもよい）

StyleSpec の最小項目：

* strokeColor、strokeWidth、fillColor、fillEnabled
* blendMode
* alpha
* join/cap

---

## 11. UI と Scene 更新プロトコル

### 11.1 UI 操作の原則

UI は「コード」を編集しない。Scene のみ編集する。

* Object 追加/削除
* geometry/transform/style の編集
* Relation の接続編集
* Generator の params 編集と再生成
* Operator の params 編集
* (t) の編集（スライダー、数値）

更新後の描画：

* 静止モード：`redraw()`
* 再生モード：UI は state 更新のみ。描画は loop 側で追従

### 11.2 編集操作の最小コマンド群（実装指針）

コマンドは次を持つ。

* type
* payload
* undo 用の逆操作情報（任意だが実務上ほぼ必要）

必須コマンド例：

* AddObject / RemoveObject
* UpdateObject（部分更新）
* AddRelation / RemoveRelation / UpdateRelation
* AddOperator / RemoveOperator / UpdateOperator
* RegenerateGenerator
* SetTime / Play / Pause / Step

---

## 12. 書き出し仕様（静止画・フレーム列）

### 12.1 静止画（PNG）

入力：

* target：最終出力または特定 stage
* (t)
* width,height
* transparent（背景透明）
* fileName

手順：

1. 一時 RenderConfig を差し替え
2. `Render(Scene,t)` をオフスクリーンに実行
3. `saveCanvas` 相当で保存（または `canvas.toDataURL`）
4. 設定を復元

決定性条件：

* seed を Scene に含める
* 演算は同一入力で同一出力

### 12.2 フレーム列

入力：

* (t_0,t_1,fps) または frameCount
* width,height
* stage 指定（過程書き出しのため）
* naming：`frame_00000.png` 規則固定

実行要件：

* 進捗表示とキャンセル
* 長時間時のブラウザ負荷を前提に、1 フレームごとに UI に制御を戻す（requestIdleCallback 等、実装指針）

---

## 13. パターン・タイリングの取り扱い（実装に落とすための具体）

### 13.1 反復の二段階

* 規則定義（UnitCell/Lattice/Tile Relation または Generator params）
* 展開（InstanceGenerator が Object 群を生成）

展開された各 Instance は通常 Object なので、個別に Operator を掛けたり、別の Relation に接続できる。

### 13.2 タイリングの「関係」と「生成」

UI 的に Tile を Relation として見せても、実装は Generator で構わない。
ただし Scene 保存では「Tile 規則」と「生成物」が両方記録され、再生成可能であること。

保存ポリシー例：

* TileRule（パラメータ）
* GeneratedObjects（生成結果）
* Regenerate により GeneratedObjects を再作成可能

---

## 14. フォントの扱いをオブジェクト化するための資産層（Assets）

Asset は Scene 外でも良いが、再現性のため参照は Scene に保持する。

* AssetId
* kind：Font / Image / Palette 等
* source：URL またはローカル由来の識別子
* loadState：pending/ready/error
* metadata：fontName 等

フォント読み込み仕様：

* UI が file を選ぶ
* ブラウザで object URL を作る
* Asset.source に入れる
* p5 側で `loadFont(asset.source)` を実行
* ready になったら Render で使用

---

## 15. エラー処理と診断情報

レンダは失敗しても落ちないこと。

* missing asset：代替描画（矩形＋ラベル）
* invalid relation：無視し警告
* operator failure：その stage を無視し、入力をバイパスするか空出力を返す（ポリシーを type ごとに決める）

診断情報（UI 表示用）：

* warnings：対象 ID、理由、発生 stage
* errors：復旧不能だがクラッシュ回避したもの
* perf：1 フレーム評価時間、重い Operator の特定

---

## 16. 受入条件（改定版）

1. Primitive を追加し、transform を UI で変えて `redraw()` で反映される。
2. Glyph/TextRun を追加し、フォントを Asset として差し替えできる。
3. FollowPath でオブジェクトがパスに沿って動く（(t) で u が変化）。
4. Rasterize→Threshold→Erode の Operator 連鎖が動作し、過程表示で各 stage を切替できる。
5. Tile（Generator 展開）で格子状にオブジェクトが増殖し、生成物も通常 Object として選択できる。
6. 任意 (t) の PNG 出力が可能。特定 stage の PNG 出力も可能。
7. (t_0)〜(t_1) のフレーム列を連番 PNG として出力できる。
8. Scene を JSON 保存し、再読み込みで同じ出力が得られる（決定性）。

---

## 17. v1.0 に向けた固定ポイント（ここまでで設計が固まる）

v0.9 を実装に落とす際、次を固定すると後戻りが少ないです。

1. Eval 型（Geometry/Raster）の二分
2. Relation 解決のルール（失敗時の扱い含む）
3. Generator は「手動展開」を基本とするか、「毎フレーム評価」を許すか
4. Operator のグラフ表現（配列の線形順か、DAG か）

ここはあなたの意図（編集中心か、生成中心か、再生中心か）で最適が変わりますが、仕様としては両対応可能な形にしてあります。

---

この仕様をさらに「実装に直結」させるなら、次はどれを優先しますか。

1. Scene JSON スキーマ（実例つき。Object/Relation/Generator/Operator を全部含む）
2. Relation 解決のアルゴリズム仕様（Attach/Align/FollowPath の数学的定義と失敗条件）
3. Operator グラフ評価仕様（DAG、キャッシュ、stage 表示の扱い）
4. タイリングの最小実装仕様（UnitCell/Lattice の生成と生成物管理）

指定がなければ、1（JSON スキーマ）から書き起こします。
