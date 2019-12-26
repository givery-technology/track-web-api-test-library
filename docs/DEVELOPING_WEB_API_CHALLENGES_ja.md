# Web API チャレンジの作成方法

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

## サーバーサイドプログラムの作成

`api/guessing-game.ts` を `api/(ディレクトリ名).ts` に変更します。

exports の `generate`, `methods` をそれぞれ実装してください。

### `function generate(token, query)`

`https://...(OMIT).../api/(ディレクトリ名)/_generate` にアクセスすると呼び出されます。

```typescript
function generate(token: string, query: any): any {
	const answer = Number(query.answer);
	const n = Number(query.n) || 10000;
	const m = Number(query.m) || 0;
	return {
		answer: Number.isInteger(answer) ?
			answer :
			Math.floor(Math.random() * (n - m) + m),
		n,
	};
}
```

* `token`: サーバーサイドで自動生成されるトークン (UUID v4)
* `query`: API のクエリパラメータ。初期化条件など
* 返却値: `token` に紐づいたステート (セッション情報)。

### `methods`

`https://...(OMIT).../api/(ディレクトリ名)/(操作名)` にアクセスすると呼び出されます。

```typescript
const methods: Map<string, Handler | { [method: string]: Handler }> = new Map([
  ["(操作名)", (ハンドラ)]
]);

function (ハンドラ)(query: any, body: any, state: any): any {
	let result: string;
	if (query.answer > state.answer) {
		result = "hi";
	} else if (query.answer < state.answer) {
		result = "lo";
	} else {
		result = "hit";
	}
	return { result };
}
```

* `query`: API のクエリパラメータ。受験者のプログラムから渡される。
  * `query.token`: トークンが取得できる
* `body`: API のリクエストボディ。受験者のプログラムから渡される。
* `state`: `token` に紐づいたステート (セッション情報)。Mutable に変更して構わない。
* 返却値: 受験者のプログラムに渡される返却値。`application/json` として送信される。

## テストケースの作成

* 公開テストケース: `test/test.public.yml`
* 非公開テストケース: `test/test.public.yml`

にそれぞれ記述します。

```yaml
config:
  endPoint: https://challenge-server.code-check.io/api/guessing-game
  templates:
    default: &default
      generate:
        queries:
          n: '{{{n}}}'
          answer: '{{{answer}}}'
      exec:
        args: ['{{{token}}}', '{{{n}}}']
      expected:
        stdout:
          plain: '{{{answer}}}'
    basic_case: &basic_case
      title:
        ja: '[基本実装] N={{{n}}} の時、正答できる'
        en: '[Basic Case] Can solve when N={{{n}}}'
      template: *default
    edge_base: &edge_case
      title:
        ja: '[境界値] N={{{n}}}, X={{{answer}}} の時、正答できる'
        en: '[Edge Case] Can solve when N={{{n}}}'
      template: *default
testcases:
  - template: *basic_case
    params:
      n: 100
      answer: 86
  - template: *edge_case
    params:
      n: 100
      answer: 0
```

`template` の部分は再帰的に展開されるため、上記 YAML ファイルは以下の内容と同値である。

```yaml
config:
  endPoint: https://challenge-server.code-check.io/api/guessing-game
  templates: (内容省略)
testcases:
  - title:
      ja: '[基本実装] N={{{n}}} の時、正答できる'
      en: '[Edge Case] Can solve when N={{{n}}}'
    generate:
      queries:
        n: '{{{n}}}'
        answer: '{{{answer}}}'
    exec:
      args: ['{{{token}}}', '{{{n}}}']
    expected:
      stdout:
        plain: '{{{answer}}}'
    params:
      n: 100
      answer: 86
  - title:
      ja: '[境界値] N={{{n}}}, X={{{answer}}} の時、正答できる'
      en: '[Edge Case] Can solve when N={{{n}}}'
    generate:
      queries:
        n: '{{{n}}}'
        answer: '{{{answer}}}'
    exec:
      args: ['{{{token}}}', '{{{n}}}']
    expected:
      stdout:
        plain: '{{{answer}}}'
    params:
      n: 100
      answer: 0
```

### `config`

全体コンフィギュレーションに使います。

#### `endPoint`: エンドポイント (必須)

API のエンドポイントを指定します。Orca 実行サーバーからアクセスできる公開 URL を指定しなければなりません。

https://challenge-server.code-check.io/api/(ディレクトリ名)

デバッグ時には一時的に https://codecheck-challenge-api-dev.herokuapp.com/api/(ディレクトリ名) を指定します。

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

#### `generate`: サーバーサイドプログラムの `generate` 関数の引数

現時点ではクエリパラメータ経由の指定にのみ対応

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
