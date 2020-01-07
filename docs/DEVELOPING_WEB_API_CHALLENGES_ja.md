# Web API チャレンジの作成方法

## Web API テンプレートの設計思想

Web API テンプレートは、track の Web API チャレンジを用意にするため、

* ステートレスなコードでセッション・ステートが管理できる
* サーバーサイドのビジネスロジックのみで API が作成できる
* 簡易的な負荷対策 (単一テストケース中での無限 API 呼び出し)

を目指して設計しています。

問題のライターは、それぞれのチャレンジごとに、

* テスト定義: track の public, secret テストの「入力」「期待される出力」などを記載したファイル。テストランナーが自動生成するテストコードが解釈する
* Web API コード: リモートサーバー (現在は Heroku にデプロイされている) で動くコード。

を用意します。

Web API チャレンジの 1 テストケースの流れは大きく以下のとおりです。

1. テストコードが `/api/<チャレンジ名>/_generate` API を呼び出す
   1. 内部コードが、トークンを自動発行する
   2. Web API コードの `generate` メソッドが呼び出され、初期ステート (テストの正答を含む。ランダム値、クエリ引数依存した値や、固定値など) を作成する
   3. 内部コードが、トークン・初期ステートを永続化すると同時に、その値をクライアント (テストコード) に返却する
      * 初期ステートはテスト対象のプログラム (受験者が作成した CLI プログラム) からは不可視である
2. テストコードがトークンを引数にテスト対象のプログラムを起動する
3. テスト対象のプログラムが、Web API コードで定義した API (`/api/<チャレンジ名>/<メソッド名>`) を呼び出し、結果を標準出力などに返す
4. テストコードが、正答、最終ステート (`/api/<チャレンジ名>/_stat` へのアクセスで取得可能) などと標準出力結果とを比較し、テストする
   * このテストコードは YAML のテスト定義に基づいて動作する

## 事前準備

作業を行う端末で、以下の 2 つのツールをインストールします。

* `track-test-utility`
* `track-web-api-test-library`


```sh
$ npm install -g track-test-utiility track-web-api-test-library
```

`track-web-api-test-library` からは、以下の 2 つのコマンドが利用できるようになります。

* `track-web-api`: CLI ツール

## テンプレートの作成

`track-test-utility` を使います

```sh
$ track-test generate web-api
```

## Web API コードの作成

`api/guessing-game.ts` を `api/<チャレンジ名>.ts` に変更します。

exports の `generate`, `methods` をそれぞれ実装してください。

### `function generate(token, query)`

`https://...(OMIT).../api/<チャレンジ名>/_generate` にアクセスすると呼び出されます。

```typescript
function generate(token: string, query: any): any {
	return <初期ステート>;
}
```

* `token`: サーバーサイドで自動生成されるトークン (UUID v4)
* `query`: API のクエリパラメータ。初期化条件など
* 返却値: `token` に紐づいたステート (セッション情報)。このステートは自動保存される。

### `methods`

`https://...(OMIT).../api/<チャレンジ名>/<操作名>` にアクセスすると呼び出されます。

```typescript
const methods: Map<string, Handler | { [method: string]: Handler }> = new Map([
  ["<操作名>", <ハンドラ>]
]);

function <ハンドラ>(query: any, body: any, state: any): any {
	<ハンドラの処理本体>;
	return <API からの JSON 返却値>;
}
```

* `query`: API のクエリパラメータ。受験者のプログラムから渡される。
  * `query.token`: トークンが取得できる
* `body`: API のリクエストボディ。受験者のプログラムから渡される。
* `state`: `token` に紐づいたステート (セッション情報)。Mutable に変更した場合、その変更は新しいステートとして保存される。
* 返却値: 受験者のプログラムに渡される返却値。`application/json` として送信される。

## テストケースの作成

* 公開テストケース: `test/test.public.yml`
* 非公開テストケース: `test/test.public.yml`

にそれぞれ記述します。

### `config`

全体コンフィギュレーションに使います。

#### `endPoint`: エンドポイント (必須)

API のエンドポイントを指定します。Orca 実行サーバーからアクセスできる公開 URL を指定しなければなりません。

https://challenge-server.code-check.io/api/<チャレンジ名>

デバッグ時には一時的に https://codecheck-challenge-api-dev.herokuapp.com/api/<チャレンジ名> を指定します。

```yaml
config:
  endPoint: https://challenge-server.code-check.io/api/my-challenge
```

※ ただし、サーバーサイドプログラムのデプロイ (後述) が必要になります。
※ http://localhost:3000/api/(ディレクトリ名) などを指定しても動作しません。

###  `testcases`

各テストケース `testcases[]` のプロパティは以下の通り

#### `params`: テストケースに紐づくパラメータ (任意)

テストケースに紐づくパラメータを格納する。
`params` 内の各プロパティはテンプレートエンジン Mustache より参照可能です。

文字列 `{{{` 、 `}}}` の中で変数 `X` を指定すると、`params.X` の値が展開されます。

#### `title`: テストケース名 (必須)

日本語、英語を併記します。

```yaml
title:
  ja: <日本語のテストケース名>
  en: <英語のテストケース名>
```

英訳を行っていないチャレンジでは、`en` を空にしてしまうと、英語モードで実行した場合にテストケース名が表示されなくなってしまいます。その場合は、`title` 直下に直接テストケース名を指定します。

NG 例:
```yaml
title:
  ja: "[基本実装] N={{{n}}} の時、正答できる"
  en:
```

OK 例:

```yaml
title: "[基本実装] N={{{n}}} の時、正答できる"
```

#### `generate`: Web API コードの `generate` 関数の呼び出し引数

`generate` に指定した値が、Web API コードの `generate` 関数の第 2 引数として呼び出されます。

```yaml
generate:
  x: 10
  y: 20
```

とすると、Web API コードの呼び出しは以下のようになります。


```typescript
function generate(token: string, query: any): any {
	console.log(query); // -> { x: "10", y: "20" }
	...
}
```

* `queries`: クエリパラメータリスト

#### `exec`: 受験者のプログラムに渡される引数等

現時点では起動時引数の指定にのみ対応

* `args`: コマンドライン引数の内容

`exec` 評価時点では、Mustache テンプレートのパラメータ (`params`) に以下の値が使えるようになります。

* `token`: Web API アクセストークン
* `state`: サーバーサイドプログラムの `generate` 関数の戻り値 (初期ステート)

### `expected`: 期待される受験者のプログラムの実行結果

現時点では、標準出力の完全一致チェックのみ対応

* `stdout/plain`: 標準出力で出力されるべき内容

`expected` 評価時点では、Mustache テンプレートのパラメータ (`params`) に以下の値が使えるようになります。

* `token`: Web API アクセストークン
* `state`: サーバーサイドプログラムの最終ステート

### 例

例えば、次のような設定があった時、

```yaml
testcases:
  - name: "hello {{{name}}} が出力できる"
    params:
      name: john
    generate:
      name: "{{{name}}}"
    exec:
      args: 
        - "{{{token}}}"
        - "{{{name}}}"
    expected: "hello {{{name}}}"
```

とあったとき、

1. Web API コードの `generate` が
   ```typescript
   function generate(token: string, query: any): any {
	 console.log(token); // -> 52baaa19-5056-418b-ac6d-0a0372e6b740
	 console.log(query); // -> { name: "john" }
	 ...
   }
   ```
   
   のように実行される

2. テスト対象のプログラムが

   ```bash
   $ ./app 52baaa19-5056-418b-ac6d-0a0372e6b740 john
   ```

   のように起動される

3. その標準出力が

   ```plain
   hello john
   ```

   の時テスト「hello john が出力できる」が成功になります。
   
完全なサンプルは https://github.com/givery-technology/track-test-utility/tree/master/data/generate/web-api を参照してください。

## track.yml への反映

`test/test.public.yml`、`test/test.public.yml` のテストケースの内容をもとに、

* テストケース数
* デバッグ実行

を反映させます。`track.yml` のあるディレクトリで以下のコマンドを実行します。

```sh
$ track-web-api migrate-track-yml
```

## サーバーサイドプログラムのデプロイ

Coming Soon...

`track-contents-development` の `develop` ブランチにマージされた時点で、サーバーサイド (https://codecheck-challenge-api-dev.herokuapp.com/api/) に自動的にデプロイされるようになる予定です。
